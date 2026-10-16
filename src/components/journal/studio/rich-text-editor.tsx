"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";

import { normalisePastedHtml } from "@/features/journal/paste";

/**
 * THE ARTICLE EDITOR (D-123, D-135). TipTap, limited to what the Journal
 * allowlist keeps: headings (h2–h4), bold, italic, underline, strike, inline
 * code, links, lists, quotes, code blocks, dividers, and the article's own
 * images. Whatever it emits is sanitised again on the server before it is
 * stored, so the editor is a convenience, not the guard.
 *
 * IMAGES go in where the writer is — the toolbar, the "+" beside an empty
 * line, paste or drag-and-drop — and appear at once with their own progress.
 * Until the upload is checked and registered the image is held by an
 * `uploadId` (never saved: the page refuses to save while one is pending);
 * a failed upload stays in place with Try again / Remove, so nothing typed
 * is lost. A selected image offers its description (alt text), Replace and
 * Remove.
 *
 * Keyboard: every control is a real button with a visible focus ring and its
 * state in words (aria-pressed); the usual shortcuts work.
 */

export type UploadResult = { mediaId: string; src: string } | { error: string };
export type UploadImage = (file: File, onProgress: (fraction: number) => void) => Promise<UploadResult>;

type Upload = {
  /** Null while an image that came with a paste is still to be fetched from `source`. */
  file: File | null;
  source?: string;
  previewUrl: string;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
  replacing: boolean;
};

/** Upload state per uploadId, outside the document (files can't live in it). */
class UploadStore {
  private map = new Map<string, Upload>();
  private listeners = new Set<() => void>();
  private uploader: UploadImage | null = null;
  private ed: Editor | null = null;
  attach(editor: Editor | null, uploader: UploadImage) {
    this.ed = editor;
    this.uploader = uploader;
  }
  private editor = () => this.ed;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = (id: string | null) => (id ? this.map.get(id) : undefined);
  private set(id: string, u: Upload | undefined) {
    if (u) this.map.set(id, u);
    else this.map.delete(id);
    this.listeners.forEach((l) => l());
  }

  start(file: File, at: { pos: number; replace: boolean }) {
    const ed = this.editor();
    if (!ed) return;
    const id = crypto.randomUUID();
    this.set(id, { file, previewUrl: URL.createObjectURL(file), progress: 0, status: "uploading", replacing: at.replace });
    if (at.replace) {
      const node = ed.state.doc.nodeAt(at.pos);
      if (node?.type.name === "image") ed.chain().command(({ tr }) => {
        tr.setNodeMarkup(at.pos, undefined, { ...node.attrs, uploadId: id });
        return true;
      }).run();
    } else {
      ed.chain().focus().insertContentAt(at.pos, { type: "image", attrs: { src: "", alt: "", uploadId: id } }).run();
    }
    void this.run(id);
  }

  /** An image pasted from a document: fetch it and upload it into this article. */
  adopt(pos: number, src: string) {
    const ed = this.editor();
    const node = ed?.state.doc.nodeAt(pos);
    if (!ed || node?.type.name !== "image" || node.attrs.uploadId) return;
    const id = crypto.randomUUID();
    this.set(id, { file: null, source: src, previewUrl: src, progress: 0, status: "uploading", replacing: false });
    ed.chain().command(({ tr }) => {
      // The document's own address is never saved: until the copy is uploaded
      // the image serialises as the pending marker (the preview shows `src`).
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: "", uploadId: id });
      tr.setMeta("addToHistory", false);
      return true;
    }).run();
    void this.run(id);
  }

  retry = (id: string) => {
    const u = this.map.get(id);
    if (!u) return;
    this.set(id, { ...u, status: "uploading", progress: 0, error: undefined });
    void this.run(id);
  };

  /** Give up on an upload: a new image is removed; a replacement keeps the old image. */
  discard = (id: string) => {
    const ed = this.editor();
    const u = this.map.get(id);
    if (ed) {
      const found = findUploadNode(ed, id);
      if (found) {
        ed.chain().command(({ tr }) => {
          if (u?.replacing) tr.setNodeMarkup(found.pos, undefined, { ...found.attrs, uploadId: null });
          else tr.delete(found.pos, found.pos + 1);
          return true;
        }).run();
      }
    }
    if (u?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(u.previewUrl);
    this.set(id, undefined);
  };

  private async run(id: string) {
    const u = this.map.get(id);
    if (!u) return;
    if (!this.uploader) return;
    let file = u.file;
    if (!file && u.source) {
      try {
        const res = await fetch(u.source, { credentials: "omit", referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        file = new File([blob], "pasted-image", { type: blob.type });
        const cur0 = this.map.get(id);
        if (cur0) this.map.set(id, { ...cur0, file });
      } catch {
        const cur0 = this.map.get(id);
        if (cur0) this.set(id, { ...cur0, status: "failed", error: "This image couldn't be copied from the document. Save it to your device, then add it with Image." });
        return;
      }
    }
    if (!file) return;
    const result = await this.uploader(file, (p) => {
      const cur = this.map.get(id);
      if (cur && cur.status === "uploading") this.set(id, { ...cur, progress: p });
    });
    const ed = this.editor();
    const cur = this.map.get(id);
    if (!cur || !ed) return;
    if ("error" in result) {
      this.set(id, { ...cur, status: "failed", error: result.error });
      return;
    }
    const found = findUploadNode(ed, id);
    if (found) {
      ed.chain().command(({ tr }) => {
        tr.setNodeMarkup(found.pos, undefined, { ...found.attrs, src: result.src, uploadId: null });
        return true;
      }).run();
    }
    if (cur.previewUrl.startsWith("blob:")) URL.revokeObjectURL(cur.previewUrl);
    this.set(id, undefined);
  }
}

type WithUploads = { uploads?: UploadStore };
const uploadsOf = (ed: Editor) => (ed.storage as unknown as WithUploads).uploads;

function findUploadNode(ed: Editor, id: string): { pos: number; attrs: Record<string, unknown> } | null {
  let out: { pos: number; attrs: Record<string, unknown> } | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (out) return false;
    if (node.type.name === "image" && node.attrs.uploadId === id) out = { pos, attrs: node.attrs };
    return true;
  });
  return out;
}

/** How many images are still uploading, or failed and waiting for a decision. */
export function pendingUploads(ed: Editor): number {
  let n = 0;
  ed.state.doc.descendants((node) => {
    if (node.type.name === "image" && node.attrs.uploadId) n++;
    return true;
  });
  return n;
}

const JournalImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Held only while uploading: never written into the saved HTML.
      uploadId: { default: null, rendered: false, parseHTML: () => null },
    };
  },
  // A NEW image still uploading has no address yet: it serialises as an empty
  // marker the sanitiser discards, never as <img src="">. (A replacement
  // keeps the old image's address until the new one is ready.)
  renderHTML({ node, HTMLAttributes }) {
    if (node.attrs.uploadId && !node.attrs.src) return ["span", { "data-journal-upload": "pending" }];
    return ["img", HTMLAttributes];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
  // Word and Docs often put a pasted picture on the clipboard as a data: URL.
  // It is accepted only to be uploaded (adopt); saved HTML never carries one.
}).configure({ inline: false, allowBase64: true });

export function RichTextEditor({
  value,
  onChange,
  labelId,
  uploadImage,
  onPendingUploads,
  readOnly = false,
  placeholder = "Start writing…",
  header,
}: {
  /** Rendered between the toolbar and the text: the title, subtitle and byline. */
  header?: ReactNode;
  value: string;
  onChange: (html: string) => void;
  labelId: string;
  uploadImage: UploadImage;
  onPendingUploads?: (count: number) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [store] = useState(() => new UploadStore());

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"], HTMLAttributes: { rel: null, target: null } },
      }),
      JournalImage,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "wla-article-body journal-writing min-h-[22rem] max-w-none pb-[var(--space-3xl)] rounded-[var(--radius-control)]",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
      },
      transformPastedHTML: (html) => normalisePastedHtml(html),
      handlePaste: (view, event) => {
        // Word and some browsers attach a picture of the selection as well as its
        // HTML: when there is real text, paste the text (images in it are adopted).
        const html = event.clipboardData?.getData("text/html") ?? "";
        if (/<(p|h[1-6]|li|span|div|br)\b/i.test(html)) return false;
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length || readOnly) return false;
        let pos = view.state.selection.from;
        for (const f of files) store.start(f, { pos: pos++, replace: false });
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length || readOnly) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY });
        let pos = at?.pos ?? view.state.selection.from;
        for (const f of files) store.start(f, { pos: pos++, replace: false });
        return true;
      },
    },
    onCreate: ({ editor: e }) => {
      (e.storage as unknown as WithUploads).uploads = store;
    },
    onUpdate: ({ editor: e, transaction }) => {
      // Images that came with pasted content are uploaded into this article.
      if (transaction.getMeta("paste") || transaction.getMeta("uiEvent") === "paste") {
        e.state.doc.descendants((node, pos) => {
          const src = node.type.name === "image" ? String(node.attrs.src ?? "") : "";
          if (src && !node.attrs.uploadId && !src.startsWith("/api/journal/media/")) store.adopt(pos, src);
          return true;
        });
      }
      onChange(e.getHTML());
      onPendingUploads?.(pendingUploads(e));
    },
  });
  useEffect(() => {
    store.attach(editor, uploadImage);
  }, [editor, store, uploadImage]);

  const insertImageAt = useCallback(
    (file: File, pos?: number) => {
      if (!editor) return;
      store.start(file, { pos: pos ?? editor.state.selection.from, replace: false });
    },
    [editor, store],
  );

  return (
    <div className="relative">
      {editor && !readOnly && <Toolbar editor={editor} onPickImage={(f) => insertImageAt(f)} />}
      {header}
      <div className="relative">
        {editor && !readOnly && <BlockInserter editor={editor} onPickImage={insertImageAt} />}
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          // Before hydration: nothing jumps, nothing is editable yet.
          <div className="wla-article-body min-h-[22rem] text-[var(--color-text-muted)]">Loading the editor…</div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- images --
function ImageView({ node, editor, getPos, selected, updateAttributes }: NodeViewProps) {
  const store = uploadsOf(editor);
  const uploadId = (node.attrs.uploadId as string | null) ?? null;
  const upload = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => store?.get(uploadId),
    () => undefined,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const altId = useId();
  const src = upload?.previewUrl ?? (node.attrs.src as string);
  const alt = (node.attrs.alt as string) ?? "";
  const editable = editor.isEditable;
  const showControls = editable && (selected || Boolean(upload));

  return (
    <NodeViewWrapper as="figure" className="journal-image my-[var(--space-l)]" data-drag-handle="">
      <div className="relative">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className={`block h-auto w-full rounded-[var(--radius-surface)] ${selected ? "outline-2 outline-offset-4 outline-[var(--color-focus)]" : ""} ${upload ? "opacity-70" : ""}`} />
        ) : (
          <div className="h-48 w-full rounded-[var(--radius-surface)] bg-[var(--color-surface-raised)]" />
        )}
        {upload?.status === "uploading" && (
          <div className="absolute inset-x-0 bottom-0 rounded-b-[var(--radius-surface)] bg-[var(--color-background)] p-[var(--space-s)]" contentEditable={false}>
            <p className="text-[length:var(--text-small)]" role="status">
              {upload.replacing ? "Replacing image" : "Uploading image"} — {Math.round(upload.progress * 100)}%
            </p>
            <div
              role="progressbar"
              aria-label={upload.file ? `Uploading ${upload.file.name}` : "Copying a pasted image"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(upload.progress * 100)}
              className="mt-[var(--space-xs)] h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-raised)]"
            >
              <div className="h-full bg-[var(--color-primary)] transition-[width]" style={{ width: `${Math.round(upload.progress * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {upload?.status === "failed" && (
        <div role="alert" contentEditable={false} className="mt-[var(--space-s)] rounded-[var(--radius-input)] border border-[var(--color-error)] bg-[var(--color-surface)] p-[var(--space-s)]">
          <p className="text-[length:var(--text-small)]"><strong>Not uploaded:</strong> {upload.error}</p>
          <div className="mt-[var(--space-xs)] flex flex-wrap gap-[var(--space-s)]">
            <button type="button" onClick={() => store?.retry(uploadId!)} className={smallBtn}>Try again</button>
            <button type="button" onClick={() => store?.discard(uploadId!)} className={smallBtn}>
              {upload.replacing ? "Keep the old image" : "Remove"}
            </button>
          </div>
        </div>
      )}

      {showControls && !upload && (
        <div contentEditable={false} className="mt-[var(--space-s)] flex flex-wrap items-end gap-[var(--space-s)]">
          <div className="flex min-w-[14rem] flex-1 flex-col gap-[var(--space-xs)]">
            <label htmlFor={altId} className="text-[length:var(--text-small)] font-medium">Image description (for people who can&rsquo;t see it)</label>
            <input
              id={altId}
              value={alt}
              maxLength={500}
              onChange={(e) => updateAttributes({ alt: e.target.value })}
              className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            />
          </div>
          <button type="button" className={smallBtn} onClick={() => fileRef.current?.click()}>Replace</button>
          <button
            type="button"
            className={smallBtn}
            onClick={() => {
              const pos = typeof getPos === "function" ? getPos() : null;
              if (typeof pos === "number") editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
            }}
          >
            Remove image
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            aria-label="Choose a file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              const pos = typeof getPos === "function" ? getPos() : null;
              if (f && store && typeof pos === "number") store.start(f, { pos, replace: true });
            }}
          />
        </div>
      )}
      {editable && !upload && !alt && !selected && (
        <figcaption contentEditable={false} className="mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          No description yet — select the image to add one.
        </figcaption>
      )}
    </NodeViewWrapper>
  );
}

const smallBtn =
  "inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-small)] hover:bg-[var(--color-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

// ---------------------------------------------------------- "+" inserter --
/**
 * A subtle "+" beside the line the writer is on, when it is empty — the
 * place a new image or divider would go. Keyboard users have the same
 * actions in the toolbar.
 */
function BlockInserter({ editor, onPickImage }: { editor: Editor; onPickImage: (f: File, pos?: number) => void }) {
  const [where, setWhere] = useState<{ top: number; pos: number } | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  useEffect(() => {
    const update = () => {
      const { selection } = editor.state;
      const parent = selection.$from.parent;
      if (!selection.empty || parent.type.name !== "paragraph" || parent.content.size > 0 || !editor.isEditable) {
        setWhere(null);
        setOpen(false);
        return;
      }
      try {
        const dom = editor.view.dom as HTMLElement;
        const coords = editor.view.coordsAtPos(selection.from);
        const box = dom.getBoundingClientRect();
        setWhere({ top: coords.top - box.top, pos: selection.from });
      } catch {
        setWhere(null); // no layout to measure: the toolbar still inserts
      }
    };
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    editor.on("focus", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
      editor.off("focus", update);
    };
  }, [editor]);

  if (!where) return null;
  return (
    <div className="absolute right-0 z-10 md:right-auto md:left-[-3.5rem]" style={{ top: where.top - 10 }}>
      <button
        type="button"
        aria-label="Insert at this line"
        aria-expanded={open}
        aria-controls={menuId}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-[var(--target-min)] w-[var(--target-min)] items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-background)] text-[length:var(--text-h3)] leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      >
        <span aria-hidden="true">+</span>
      </button>
      {open && (
        <div id={menuId} role="group" aria-label="Insert" className="absolute left-0 top-[calc(var(--target-min)+4px)] flex w-[12rem] flex-col rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-background)] p-[var(--space-xs)] shadow-[var(--shadow-overlay)]">
          <button type="button" className={menuItem} onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}>
            Image from your device
          </button>
          <button
            type="button"
            className={menuItem}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().setHorizontalRule().run();
              setOpen(false);
            }}
          >
            Divider
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
            hidden
            aria-label="Choose a file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          setOpen(false);
          // Replace the empty line with the image(s).
          let pos = where.pos - 1;
          for (const f of files) onPickImage(f, pos++);
        }}
      />
    </div>
  );
}

const menuItem =
  "flex min-h-[var(--target-min)] items-center rounded-[var(--radius-control)] px-[var(--space-s)] text-left text-[length:var(--text-small)] hover:bg-[var(--color-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

// -------------------------------------------------------------- toolbar --
const btn =
  "inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center justify-center rounded-[var(--radius-control)] px-[var(--space-xs)] text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] disabled:opacity-40";

function ToolButton({ label, children, pressed, onClick, disabled }: { label: string; children: React.ReactNode; pressed?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`${btn} ${pressed ? "bg-[var(--color-surface-sage)] font-semibold underline" : "hover:bg-[var(--color-surface-raised)]"}`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span aria-hidden="true" className="mx-[var(--space-xs)] h-6 w-px self-center bg-[var(--color-border)]" />;

function Toolbar({ editor, onPickImage }: { editor: Editor; onPickImage: (f: File) => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("heading", { level: 4 }) ? "h4" : e.isActive("codeBlock") ? "code" : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const styleId = useId();
  const c = () => editor.chain().focus();

  return (
    <div className="sticky top-[var(--studio-bar-height,0px)] z-20 -mx-[var(--space-m)] mb-[var(--space-l)] border-b border-[var(--color-border)] bg-[var(--color-background)] px-[var(--space-m)] py-[var(--space-xs)]">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-[2px]">
        <ToolButton label="Undo" onClick={() => c().undo().run()} disabled={!s.canUndo}><span aria-hidden="true">↶</span></ToolButton>
        <ToolButton label="Redo" onClick={() => c().redo().run()} disabled={!s.canRedo}><span aria-hidden="true">↷</span></ToolButton>
        <Sep />
        <label htmlFor={styleId} className="sr-only">Text style</label>
        <select
          id={styleId}
          value={s.block}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") c().setParagraph().run();
            else if (v === "code") c().setCodeBlock().run();
            else c().setHeading({ level: Number(v.slice(1)) as 2 | 3 | 4 }).run();
          }}
          className="min-h-[var(--target-min)] rounded-[var(--radius-control)] border border-transparent bg-transparent px-[var(--space-xs)] text-[length:var(--text-small)] hover:bg-[var(--color-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          <option value="p">Normal text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="h4">Small heading</option>
          <option value="code">Code block</option>
        </select>
        <Sep />
        <ToolButton label="Bold" pressed={s.bold} onClick={() => c().toggleBold().run()}><strong aria-hidden="true">B</strong></ToolButton>
        <ToolButton label="Italic" pressed={s.italic} onClick={() => c().toggleItalic().run()}><em aria-hidden="true" className="font-[family-name:var(--font-serif)]">I</em></ToolButton>
        <ToolButton label="Underline" pressed={s.underline} onClick={() => c().toggleUnderline().run()}><span aria-hidden="true" className="underline">U</span></ToolButton>
        <ToolButton label="Strikethrough" pressed={s.strike} onClick={() => c().toggleStrike().run()}><span aria-hidden="true" className="line-through">S</span></ToolButton>
        <ToolButton label="Inline code" pressed={s.code} onClick={() => c().toggleCode().run()}><span aria-hidden="true" className="font-mono">{"</>"}</span></ToolButton>
        <Sep />
        <ToolButton label={s.link ? "Edit link" : "Add link"} pressed={s.link} onClick={() => setLinkOpen((o) => !o)}>Link</ToolButton>
        <ToolButton label="Insert image" onClick={() => fileRef.current?.click()}>Image</ToolButton>
        <input
          ref={fileRef}
          type="file"
            hidden
            aria-label="Choose a file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          tabIndex={-1}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            for (const f of files) onPickImage(f);
          }}
        />
        <Sep />
        <ToolButton label="Bulleted list" pressed={s.bullet} onClick={() => c().toggleBulletList().run()}><span aria-hidden="true">•≡</span></ToolButton>
        <ToolButton label="Numbered list" pressed={s.ordered} onClick={() => c().toggleOrderedList().run()}><span aria-hidden="true">1.≡</span></ToolButton>
        <ToolButton label="Quote" pressed={s.quote} onClick={() => c().toggleBlockquote().run()}><span aria-hidden="true" className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">&ldquo;</span></ToolButton>
        <ToolButton label="Divider" onClick={() => c().setHorizontalRule().run()}><span aria-hidden="true">—</span></ToolButton>
      </div>
      {linkOpen && <LinkForm editor={editor} current={s.href} onDone={() => setLinkOpen(false)} />}
    </div>
  );
}

function LinkForm({ editor, current, onDone }: { editor: Editor; current: string; onDone: () => void }) {
  const id = useId();
  const [href, setHref] = useState(current);
  const [problem, setProblem] = useState<string | null>(null);
  const apply = () => {
    const v = href.trim();
    if (!v) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onDone();
    }
    if (!/^(https?:\/\/|mailto:|\/)/i.test(v)) {
      setProblem("Start the address with https://, mailto: or /.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: v }).run();
    onDone();
  };
  return (
    <div className="mt-[var(--space-xs)] flex flex-wrap items-end gap-[var(--space-s)] border-t border-[var(--color-border)] pt-[var(--space-s)]">
      <div className="flex min-w-[12rem] flex-1 flex-col gap-[var(--space-xs)]">
        <label htmlFor={id} className="text-[length:var(--text-small)] font-medium">Link address</label>
        <input
          id={id}
          value={href}
          autoFocus
          onChange={(e) => { setHref(e.target.value); setProblem(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } if (e.key === "Escape") onDone(); }}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-p` : undefined}
          className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
        {problem && <p id={`${id}-p`} role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{problem}</p>}
      </div>
      <button type="button" onClick={apply} className={smallBtn}>Apply</button>
      {current && (
        <button type="button" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onDone(); }} className={smallBtn}>
          Remove link
        </button>
      )}
      <button type="button" onClick={onDone} className={`${btn} underline`}>Cancel</button>
    </div>
  );
}

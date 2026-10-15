"use client";

import { useId, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

import { mediaUrl } from "@/features/journal/content";

/**
 * THE ARTICLE EDITOR (D-123). TipTap, limited to what the Journal allowlist
 * keeps: headings (h2–h4), bold, italic, underline, strike, inline code,
 * links, bulleted and numbered lists, quotes, code blocks, rules, and images
 * from this article's own media. Whatever it emits is sanitised again on the
 * server before it is stored, so the editor is a convenience, not the guard.
 *
 * Keyboard: every control is a real button with a visible focus ring and a
 * pressed state in words (aria-pressed), and the usual shortcuts work
 * (Ctrl/⌘ + B, I, U, Z, Shift+Z).
 */
export type MediaOption = { id: string; alt: string | null };

export function RichTextEditor({
  value,
  onChange,
  labelId,
  media,
  readOnly = false,
}: {
  value: string;
  onChange: (html: string) => void;
  labelId: string;
  media: MediaOption[];
  readOnly?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"], HTMLAttributes: { rel: null, target: null } },
      }),
      Image.configure({ inline: false }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "wla-article-body min-h-[18rem] max-w-none rounded-b-[var(--radius-input)] border border-t-0 border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-m)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  return (
    <div>
      {editor && !readOnly && <Toolbar editor={editor} media={media} />}
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        // Before hydration: the stored HTML, read-only, so nothing jumps.
        <div className="wla-article-body min-h-[18rem] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-m)] text-[var(--color-text-muted)]">
          Loading the editor…
        </div>
      )}
    </div>
  );
}

const btn =
  "inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center justify-center rounded-[var(--radius-control)] border px-[var(--space-s)] text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

function ToolButton({ label, short, pressed, onClick, disabled }: { label: string; short: string; pressed?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`${btn} ${pressed ? "border-[var(--color-text)] bg-[var(--color-surface-sage)] font-medium underline" : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"} disabled:opacity-50`}
    >
      {short}
    </button>
  );
}

function Toolbar({ editor, media }: { editor: Editor; media: MediaOption[] }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const c = () => editor.chain().focus();

  return (
    <div className="rounded-t-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-[var(--space-xs)]">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-[var(--space-xs)]">
        <ToolButton label="Heading" short="H2" pressed={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
        <ToolButton label="Subheading" short="H3" pressed={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
        <ToolButton label="Minor heading" short="H4" pressed={s.h4} onClick={() => c().toggleHeading({ level: 4 }).run()} />
        <ToolButton label="Bold" short="B" pressed={s.bold} onClick={() => c().toggleBold().run()} />
        <ToolButton label="Italic" short="I" pressed={s.italic} onClick={() => c().toggleItalic().run()} />
        <ToolButton label="Underline" short="U" pressed={s.underline} onClick={() => c().toggleUnderline().run()} />
        <ToolButton label="Strikethrough" short="S" pressed={s.strike} onClick={() => c().toggleStrike().run()} />
        <ToolButton label="Inline code" short="</>" pressed={s.code} onClick={() => c().toggleCode().run()} />
        <ToolButton label={s.link ? "Edit link" : "Add link"} short="Link" pressed={s.link} onClick={() => setLinkOpen((o) => !o)} />
        <ToolButton label="Bulleted list" short="• List" pressed={s.bullet} onClick={() => c().toggleBulletList().run()} />
        <ToolButton label="Numbered list" short="1. List" pressed={s.ordered} onClick={() => c().toggleOrderedList().run()} />
        <ToolButton label="Quote" short="Quote" pressed={s.quote} onClick={() => c().toggleBlockquote().run()} />
        <ToolButton label="Code block" short="Code" pressed={s.codeBlock} onClick={() => c().toggleCodeBlock().run()} />
        <ToolButton label="Divider" short="—" onClick={() => c().setHorizontalRule().run()} />
        <ToolButton label="Insert image" short="Image" onClick={() => setImageOpen((o) => !o)} />
        <ToolButton label="Undo" short="Undo" onClick={() => c().undo().run()} disabled={!s.canUndo} />
        <ToolButton label="Redo" short="Redo" onClick={() => c().redo().run()} disabled={!s.canRedo} />
      </div>
      {linkOpen && <LinkForm editor={editor} current={s.href} onDone={() => setLinkOpen(false)} />}
      {imageOpen && <ImagePicker editor={editor} media={media} onDone={() => setImageOpen(false)} />}
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
          onChange={(e) => { setHref(e.target.value); setProblem(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-p` : undefined}
          className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
        {problem && <p id={`${id}-p`} role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{problem}</p>}
      </div>
      <button type="button" onClick={apply} className={`${btn} border-[var(--color-border-strong)] bg-[var(--color-surface)]`}>Apply</button>
      {current && (
        <button type="button" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onDone(); }} className={`${btn} border-[var(--color-border)] bg-[var(--color-surface)]`}>
          Remove link
        </button>
      )}
      <button type="button" onClick={onDone} className={`${btn} border-transparent underline`}>Cancel</button>
    </div>
  );
}

function ImagePicker({ editor, media, onDone }: { editor: Editor; media: MediaOption[]; onDone: () => void }) {
  if (media.length === 0) {
    return (
      <p className="mt-[var(--space-xs)] border-t border-[var(--color-border)] pt-[var(--space-s)] text-[length:var(--text-small)]">
        Upload an image under “Images” first, then insert it here.{" "}
        <button type="button" onClick={onDone} className="underline underline-offset-4">Close</button>
      </p>
    );
  }
  return (
    <div className="mt-[var(--space-xs)] border-t border-[var(--color-border)] pt-[var(--space-s)]">
      <p className="text-[length:var(--text-small)] font-medium">Choose an image to insert</p>
      <ul className="mt-[var(--space-xs)] flex flex-wrap gap-[var(--space-s)]">
        {media.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => { editor.chain().focus().setImage({ src: mediaUrl(m.id), alt: m.alt ?? "" }).run(); onDone(); }}
              className={`${btn} gap-[var(--space-xs)] border-[var(--color-border)] bg-[var(--color-surface)] py-[var(--space-xs)]`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(m.id)} alt="" className="h-10 w-14 rounded-[var(--radius-control)] object-cover" />
              <span>{m.alt || "Image without a description"}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone} className="mt-[var(--space-xs)] min-h-[var(--target-min)] underline underline-offset-4">Cancel</button>
    </div>
  );
}

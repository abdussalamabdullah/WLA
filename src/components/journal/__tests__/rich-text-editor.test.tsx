import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EditorView } from "@tiptap/pm/view";

import { RichTextEditor, type UploadResult } from "../studio/rich-text-editor";

/*
 * The real TipTap editor (no mock): an image goes in where the writer is,
 * shows its upload, survives a failure with Try again, and only a finished
 * upload reaches the saved HTML (D-135).
 */
beforeAll(() => {
  let n = 0;
  URL.createObjectURL = () => `blob:test/${++n}`;
  URL.revokeObjectURL = () => {};
  // ProseMirror measures layout jsdom doesn't have.
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  const box = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) });
  for (const proto of [Element.prototype, Range.prototype, Text.prototype] as unknown as { getClientRects?: unknown; getBoundingClientRect?: unknown }[]) {
    proto.getClientRects ??= rects;
    proto.getBoundingClientRect ??= box;
  }
  document.elementFromPoint ??= () => null;
  // jsdom has no ClipboardEvent; ProseMirror's pasteHTML creates one.
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent ??= class extends Event {
    clipboardData = null;
  };
});
afterEach(() => vi.restoreAllMocks());

const MEDIA = "0b8f3c2e-1d4a-4c8e-9f00-123456789abc";

function setup(results: (() => Promise<UploadResult>)[]) {
  const onChange = vi.fn();
  const onPending = vi.fn();
  const upload = vi.fn((_f: File, onProgress: (x: number) => void) => {
    onProgress(0.5);
    return results.shift()!();
  });
  render(
    <div>
      <span id="lbl">Article</span>
      <RichTextEditor value="<p>Before.</p>" onChange={onChange} labelId="lbl" uploadImage={upload} onPendingUploads={onPending} />
    </div>,
  );
  return { onChange, onPending, upload };
}

const pick = async (name = "photo.png") => {
  const input = (await screen.findByRole("button", { name: "Insert image" })).parentElement!.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
};

describe("inline images", () => {
  it("a failed upload stays in place with Try again; a successful retry becomes a saved image", async () => {
    let failNow!: (r: UploadResult) => void;
    const { onChange, onPending, upload } = setup([
      () => new Promise((r) => { failNow = r; }),
      async () => ({ mediaId: MEDIA, src: `/api/journal/media/${MEDIA}` }),
    ]);
    await pick();
    expect(await screen.findByText(/Uploading image — 50%/)).toBeInTheDocument();
    expect(onPending).toHaveBeenLastCalledWith(1);
    // Nothing unfinished ever reaches the HTML that would be saved.
    expect(onChange.mock.calls.at(-1)?.[0] ?? "").not.toMatch(/blob:|<img/);

    await act(async () => failNow({ error: "That image is larger than 10 MB." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not uploaded: That image is larger than 10 MB.");
    expect(screen.getByText("Before.")).toBeInTheDocument(); // the article is untouched

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    await waitFor(() => expect(onPending).toHaveBeenLastCalledWith(0));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls.at(-1)?.[0]).toContain(`<img src="/api/journal/media/${MEDIA}"`);
  });

  it("removing a failed upload leaves no trace in the article", async () => {
    const { onChange, onPending } = setup([async () => ({ error: "The upload was interrupted. Check your connection and try again." })]);
    await pick();
    await screen.findByRole("alert");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Remove" })); });
    await waitFor(() => expect(onPending).toHaveBeenLastCalledWith(0));
    expect(onChange.mock.calls.at(-1)?.[0]).not.toMatch(/<img/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the toolbar names every control and says which are on", async () => {
    setup([]);
    const bold = await screen.findByRole("button", { name: "Bold" });
    expect(bold).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "Text style" })).toHaveValue("p");
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });
});

/*
 * Pasting from Google Docs (D-138), through the real editor's paste path
 * (ProseMirror's own pasteHTML, which runs transformPastedHTML and handlePaste).
 */
const view = async (): Promise<EditorView> => {
  await screen.findByRole("button", { name: "Bold" });
  const dom = document.querySelector(".ProseMirror") as HTMLElement & { editor?: { view: EditorView } };
  return dom.editor!.view;
};
const docsClipboard = readFileSync(join(__dirname, "../../../features/journal/__tests__/fixtures/google-docs-clipboard.html"), "utf8");

describe("pasting a Google Doc", () => {
  it("keeps bold, italic, headings and paragraphs — without the doubled blank lines", async () => {
    const { onChange } = setup([]);
    const v = await view();
    await act(async () => { v.pasteHTML(docsClipboard); });
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).toMatch(/<strong>bold words<\/strong>/);
    expect(html).toMatch(/<em>[^<]+<\/em>/);
    expect(html).toMatch(/<h2>Why walk at all<\/h2>/);
    expect(html).not.toMatch(/<p><\/p>|<p><br[^>]*><\/p>/);
    expect(html).not.toMatch(/style=|docs-internal-guid|<h1/);
  });

  it("an image in the pasted document is copied into the article, never left pointing at Google", async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(png, { status: 200 }));
    const { onChange, onPending, upload } = setup([async () => ({ mediaId: MEDIA, src: `/api/journal/media/${MEDIA}` })]);
    const v = await view();
    await act(async () => { v.pasteHTML('<p>Text</p><p><img src="https://lh7-rt.googleusercontent.com/docsz/abc" alt="A walk"></p>'); });
    await waitFor(() => expect(onPending).toHaveBeenLastCalledWith(0));
    expect(fetchMock).toHaveBeenCalledWith("https://lh7-rt.googleusercontent.com/docsz/abc", expect.objectContaining({ credentials: "omit" }));
    expect(upload).toHaveBeenCalledTimes(1);
    const html = onChange.mock.calls.at(-1)?.[0] as string;
    expect(html).toContain(`src="/api/journal/media/${MEDIA}"`);
    expect(onChange.mock.calls.flat().join("")).not.toMatch(/googleusercontent/);
  });

  it("a picture pasted as a data: URL (Word, Docs) is uploaded too, and never saved as data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })));
    const { onChange, onPending, upload } = setup([async () => ({ mediaId: MEDIA, src: `/api/journal/media/${MEDIA}` })]);
    const v = await view();
    await act(async () => { v.pasteHTML('<p>Text</p><p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Chart"></p>'); });
    await waitFor(() => expect(onPending).toHaveBeenLastCalledWith(0));
    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,iVBORw0KGgo=", expect.anything());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls.at(-1)?.[0]).toContain(`<img src="/api/journal/media/${MEDIA}" alt="Chart"`);
    expect(onChange.mock.calls.flat().join("")).not.toMatch(/data:image/);
  });

  it("an image that can't be fetched stays in place with a plain explanation, Try again and Remove", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const { onChange, onPending, upload } = setup([]);
    const v = await view();
    await act(async () => { v.pasteHTML('<p>Text</p><p><img src="https://lh7-rt.googleusercontent.com/docsz/abc"></p>'); });
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be copied from the document/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(onPending).toHaveBeenLastCalledWith(1);
    expect(upload).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Remove" })); });
    await waitFor(() => expect(onPending).toHaveBeenLastCalledWith(0));
    expect(onChange.mock.calls.at(-1)?.[0]).not.toMatch(/<img|googleusercontent/);
  });
});

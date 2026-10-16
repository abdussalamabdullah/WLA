import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }) }));
vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://db.test", supabaseAnonKey: "anon" } }));

const actions = vi.hoisted(() => {
  const ok = async () => ({ ok: true, notice: "Done." });
  return {
    saveRevisionAction: vi.fn(async () => ({ ok: true, lockVersion: 3, revisionId: "r1", contentHash: "h-saved", notice: "Saved." })),
    publishAction: vi.fn(ok),
    scheduleAction: vi.fn(ok),
    cancelScheduleAction: vi.fn(ok),
    unpublishAction: vi.fn(ok),
    archiveAction: vi.fn(ok),
    deleteArticleAction: vi.fn(ok),
    addCommentAction: vi.fn(ok),
    resolveCommentAction: vi.fn(ok),
    setMemberAction: vi.fn(ok),
    registerUploadAction: vi.fn(ok),
    createPreviewLinkAction: vi.fn(async () => ({ ok: true, previewUrl: "http://app.test/journal-preview/abc", notice: "Preview link created." })),
    revokePreviewLinkAction: vi.fn(ok),
  };
});
vi.mock("@/features/journal/actions", () => actions);
// The editor itself is TipTap; here it is a textarea so the page logic is what is tested.
vi.mock("../studio/rich-text-editor", () => ({
  RichTextEditor: ({ value, onChange, labelId, header, readOnly }: { value: string; onChange: (v: string) => void; labelId: string; header?: React.ReactNode; readOnly?: boolean }) => (
    <div>
      {header}
      <textarea aria-labelledby={labelId} defaultValue={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
}));

// jsdom has no <dialog> methods.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  Object.values(actions).forEach((f) => f.mockClear());
});

import { UnsavedChangesProvider } from "@/components/admin/unsaved-changes";
import { ArticleStudio, type StudioProps } from "../studio/article-studio";

/*
 * The studio, rendered. These test what each person is OFFERED and what is
 * SENT; what they are ALLOWED is enforced and tested in the database
 * (scripts/journal-regression.sql).
 */
const base: StudioProps = {
  articleId: "a1",
  revision: {
    id: "r1", number: 1, state: "draft", lock_version: 2, content_hash: "h1",
    title: "First light", slug: "first-light", excerpt: "A start.", body_html: "<p>Hello.</p>",
    author_name: "Wren", category_id: null, tags: [], featured_media_id: null, featured_alt: null,
    seo_title: null, seo_description: null, canonical_url: null, original_published_at: null,
  },
  lockedReason: null,
  statusWords: "Draft",
  live: null,
  scheduled: null,
  scheduler: null,
  canPublish: true,
  isEditor: false,
  archived: false,
  everPublished: false,
  publicSiteOrigin: null,
  categories: [{ id: "c1", name: "Essays" }],
  media: [],
  previewLinks: [],
  people: { members: [{ id: "u1", name: "Wren", role: "author" }], writers: [], canManage: true },
  comments: <p>No comments.</p>,
  commentCount: 0,
  history: <p>History list.</p>,
};
const studio = (over: Partial<StudioProps> = {}) =>
  render(<UnsavedChangesProvider><ArticleStudio {...base} {...over} /></UnsavedChangesProvider>);

const typeTitle = (v: string) => fireEvent.change(screen.getByLabelText("Title"), { target: { value: v } });

describe("one place for every publishing action", () => {
  it("an author sees Save draft, Share and Publish together, and the status in words", () => {
    studio();
    const bar = screen.getByRole("button", { name: "Save draft" }).closest("div")!;
    expect(within(bar).getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Publish…" })).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("there is no review step anywhere (D-130): nothing to request, assign or approve", () => {
    studio();
    expect(screen.queryByText(/review/i)).toBeNull();
    expect(screen.queryByText(/approv/i)).toBeNull();
  });

  it("a collaborator who may not publish sees no Publish button", () => {
    studio({ canPublish: false });
    expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  });

  it("an edited published article says so, and publishing is an update", () => {
    studio({ live: { revisionId: "r0", number: 1, slug: "first-light", publicUrl: null, studioViewHref: "/editorial/articles/a1/preview?revision=r0" }, statusWords: "Published · unpublished changes" });
    expect(screen.getByText("Published · unpublished changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish update…" })).toBeInTheDocument();
    expect(screen.getByText(/Readers still see the published version/)).toBeInTheDocument();
  });
});

describe("the live link goes where readers are (the 404 fix, D-137)", () => {
  it("without a public site configured, it opens the studio's own view — never /journal here", () => {
    studio({ live: { revisionId: "r1", number: 1, slug: "first-light", publicUrl: null, studioViewHref: "/editorial/articles/a1/preview?revision=r1" } });
    const link = screen.getByRole("link", { name: "Read the published version" });
    expect(link).toHaveAttribute("href", "/editorial/articles/a1/preview?revision=r1");
    expect(document.querySelector('a[href^="/journal/"]')).toBeNull();
  });
  it("with the public site configured, it opens the article there", () => {
    studio({ live: { revisionId: "r1", number: 1, slug: "first-light", publicUrl: "https://site.test/journal/first-light", studioViewHref: "/x" } });
    expect(screen.getByRole("link", { name: /View it on the public Journal/ })).toHaveAttribute("href", "https://site.test/journal/first-light");
  });
});

describe("saving", () => {
  it("sends the lock version and revision it started from, with the settings fields", async () => {
    studio();
    typeTitle("First light, revised");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); });
    expect(actions.saveRevisionAction).toHaveBeenCalledTimes(1);
    const fd = (actions.saveRevisionAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.get("lockVersion")).toBe("2");
    expect(fd.get("revisionId")).toBe("r1");
    expect(fd.get("title")).toBe("First light, revised");
    // Settings live in a side panel but belong to the same form.
    expect(fd.get("category_id")).toBe("");
    expect(fd.has("slug") && fd.has("tags") && fd.has("seo_title")).toBe(true);
  });

  it("after a successful save it says Saved — new lock and revision are bookkeeping, not unsaved changes", async () => {
    actions.saveRevisionAction.mockResolvedValueOnce({ ok: true, lockVersion: 7, revisionId: "r9", contentHash: "h9", notice: "Saved." } as never);
    studio();
    typeTitle("Changed");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); });
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("a new article's web address follows its title until set by hand", async () => {
    studio({ revision: { ...base.revision, title: "", slug: "" } });
    typeTitle("A Quiet Morning");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); });
    const fd = (actions.saveRevisionAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.get("slug")).toBe("a-quiet-morning");
  });

  it("the first save of an edit to a published article says a new draft was made", async () => {
    actions.saveRevisionAction.mockResolvedValueOnce({ ok: true, lockVersion: 1, revisionId: "r2", contentHash: "h2", startedNewVersion: true, notice: "Saved as a new draft. Readers still see the published version until you publish this one." } as never);
    studio({ live: { revisionId: "r1", number: 1, slug: "first-light", publicUrl: null, studioViewHref: "/x" } });
    typeTitle("Edited");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); });
    expect(await screen.findByText(/Saved as a new draft/)).toBeInTheDocument();
    expect((document.querySelector('input[name="revisionId"]') as HTMLInputElement).value).toBe("r2");
  });

  it("a conflict keeps the author's text and names who saved", async () => {
    actions.saveRevisionAction.mockResolvedValueOnce({ error: "x", conflict: { by: "Eda", at: "2026-10-15T10:00:00Z", lockVersion: 5 } } as never);
    studio();
    typeTitle("Mine");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); });
    expect(await screen.findByText(/Someone else saved this article/)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Mine");
    fireEvent.click(screen.getByRole("button", { name: /Keep mine/ }));
    expect((document.querySelector('input[name="lockVersion"]') as HTMLInputElement).value).toBe("5");
  });
});

describe("publishing and scheduling (one dialog, no approval)", () => {
  it("publishes the saved version directly", async () => {
    studio();
    fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Publish now" })); });
    const fd = (actions.publishAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.get("revisionId")).toBe("r1");
    expect(fd.get("contentHash")).toBe("h1");
    expect(actions.saveRevisionAction).not.toHaveBeenCalled();
  });

  it("unsaved changes are saved first, then exactly that saved version is published", async () => {
    actions.saveRevisionAction.mockResolvedValueOnce({ ok: true, lockVersion: 3, revisionId: "r1", contentHash: "h-new", notice: "Saved." } as never);
    studio();
    typeTitle("Changed");
    fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
    expect(screen.getByText(/Your unsaved changes are saved first/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Publish now" })); });
    expect(actions.saveRevisionAction).toHaveBeenCalledTimes(1);
    const fd = (actions.publishAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.get("contentHash")).toBe("h-new");
  });

  it("if the save fails, nothing is published", async () => {
    actions.saveRevisionAction.mockResolvedValueOnce({ error: "That didn't save." } as never);
    studio();
    typeTitle("Changed");
    fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Publish now" })); });
    expect(actions.publishAction).not.toHaveBeenCalled();
  });

  it("says what is missing instead of offering to publish", () => {
    studio({ revision: { ...base.revision, title: "", slug: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
    expect(screen.getByText("Give it a title.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish now" })).toBeNull();
  });

  it("schedules in UK time, previewed in words, sent as the wall time", async () => {
    studio();
    fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
    fireEvent.click(screen.getByLabelText("At a later time"));
    fireEvent.change(screen.getByLabelText(/Date and time — UK time/), { target: { value: "2026-12-01T09:30" } });
    expect(screen.getByText(/^= /)).toHaveTextContent("09:30");
    expect(screen.getByText(/publishes by itself at that moment/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Schedule" })); });
    const fd = (actions.scheduleAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.get("atLocal")).toBe("2026-12-01T09:30");
  });

  it("an already-published version with no changes has nothing to publish", () => {
    studio({ live: { revisionId: "r1", number: 1, slug: "first-light", publicUrl: null, studioViewHref: "/x" }, statusWords: "Published" });
    fireEvent.click(screen.getByRole("button", { name: "Publish update…" }));
    expect(screen.getByText(/already published/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish update now/ })).toBeNull();
  });

  it("a scheduled article is locked, says when, and offers cancelling", () => {
    studio({ scheduled: { at: "2026-12-01T09:30:00Z", by: "Wren" }, lockedReason: "Scheduled to publish… Cancel the schedule to make changes." });
    expect(screen.getByText(/to publish automatically on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel the schedule/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();
  });
});

describe("sharing a preview", () => {
  it("makes a view-only link, shown once, and keeps editing separate", async () => {
    studio({ previewLinks: [{ id: "l1", createdAt: "2026-10-15T08:00:00Z", expiresAt: "2026-11-14T08:00:00Z", by: "Wren" }] });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const dlg = screen.getByRole("dialog", { name: "Share a preview" });
    expect(within(dlg).getByText(/View only/)).toBeInTheDocument();
    expect(within(dlg).getByText(/A preview link never lets anyone edit/)).toBeInTheDocument();
    expect(within(dlg).getByRole("button", { name: "Turn off" })).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: "Create a preview link" })); });
    expect(within(dlg).getByLabelText("Your preview link")).toHaveValue("http://app.test/journal-preview/abc");
    expect(within(dlg).getByText(/shown only once/)).toBeInTheDocument();
    expect(within(dlg).getByRole("heading", { name: "Who can edit" })).toBeInTheDocument();
  });
});

describe("headings, words and focus", () => {
  it("headings never skip a level, with every panel and dialog open", () => {
    studio({ live: { revisionId: "r1", number: 1, slug: "s", publicUrl: null, studioViewHref: "/x" }, isEditor: true });
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const levels = Array.from(document.querySelectorAll("h1,h2,h3,h4")).filter((h) => !h.closest("[hidden]")).map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });

  it("the settings panel opens with focus on its heading and closes with Escape", async () => {
    studio();
    const toggle = screen.getByRole("button", { name: /Settings/ });
    fireEvent.click(toggle);
    const heading = screen.getByRole("heading", { name: "Article settings" });
    await waitFor(() => expect(heading).toHaveFocus());
    fireEvent.keyDown(heading, { key: "Escape" });
    await waitFor(() => expect(heading.closest("aside")).toHaveAttribute("hidden"));
  });

  it("archive and delete stay out of the writing flow, inside Settings, for editors only", () => {
    studio({ isEditor: false });
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    studio({ isEditor: true });
    fireEvent.click(screen.getAllByRole("button", { name: /Settings/ })[1]);
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete this draft" })).toBeInTheDocument();
  });
});

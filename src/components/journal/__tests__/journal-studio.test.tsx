import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const actions = vi.hoisted(() => {
  const ok = async () => ({ ok: true, notice: "Done." });
  return {
    saveRevisionAction: vi.fn(async () => ({})),
    submitAction: vi.fn(ok),
    withdrawAction: vi.fn(ok),
    startRevisionAction: vi.fn(ok),
    assignReviewerAction: vi.fn(ok),
    decideAction: vi.fn(ok),
    publishAction: vi.fn(ok),
    scheduleAction: vi.fn(ok),
    cancelScheduleAction: vi.fn(ok),
    unpublishAction: vi.fn(ok),
    archiveAction: vi.fn(ok),
    deleteArticleAction: vi.fn(ok),
    addCommentAction: vi.fn(ok),
    resolveCommentAction: vi.fn(ok),
    setMemberAction: vi.fn(ok),
    uploadImageAction: vi.fn(ok),
  };
});
vi.mock("@/features/journal/actions", () => actions);
// The editor itself is TipTap; here it is a textarea so the form logic is what is tested.
vi.mock("../studio/rich-text-editor", () => ({
  RichTextEditor: ({ value, onChange, labelId }: { value: string; onChange: (v: string) => void; labelId: string }) => (
    <textarea aria-labelledby={labelId} defaultValue={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { UnsavedChangesProvider } from "@/components/admin/unsaved-changes";
import { WorkflowPanel, type WorkflowProps } from "../studio/workflow-panel";
import { RevisionEditor } from "../studio/revision-editor";
import { CommentsPanel, ImagesPanel, PeoplePanel } from "../studio/side-panels";
import { History } from "../studio/history";
import { JournalStatus } from "../studio/status";

/*
 * The studio, rendered. These test what each person is OFFERED; what they are
 * ALLOWED is enforced and tested in the database (journal-regression.sql).
 */

const base: WorkflowProps = {
  articleId: "a1",
  caps: { canWrite: true, canReview: false, isEditor: false },
  canEdit: true,
  canPublish: false,
  archived: false,
  everPublished: false,
  live: null,
  working: { id: "r1", number: 1, state: "draft", contentHash: "h1" },
  scheduled: null,
  scheduler: null,
  reviewers: [],
  reviewerChoices: [{ id: "u2", name: "Rae Reviewer" }],
  isAssignedReviewer: false,
  editedWorkingRevision: false,
};
const editor = { canWrite: true, canReview: true, isEditor: true };

beforeEach(() => vi.clearAllMocks());

/** The FormData an action was called with (its second argument). */
const sent = (fn: { mock: { calls: unknown[][] } }, call = 0) => fn.mock.calls[call][1] as FormData;

describe("what each person is offered", () => {
  it("someone who may not publish this article sees no publishing, assigning or archiving", () => {
    render(<WorkflowPanel {...base} />);
    expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("an author publishes their own unreviewed draft directly (D-130)", async () => {
    render(<WorkflowPanel {...base} canPublish working={{ id: "r1", number: 1, state: "draft", contentHash: "h1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish version 1 now" }));
    expect(actions.publishAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Exactly the content you last saved is published/)).toBeDefined();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Publish" })));
    expect(sent(actions.publishAction).get("contentHash")).toBe("h1");
    expect(sent(actions.publishAction).get("revisionId")).toBe("r1");
  });

  it("a version in an optional review can still be published", () => {
    render(<WorkflowPanel {...base} canPublish working={{ id: "r1", number: 1, state: "in_review", contentHash: "h" }} />);
    expect(screen.getByRole("button", { name: "Publish version 1 now" })).toBeDefined();
  });

  it("an assigned reviewer gets the decision form, which says review is optional", () => {
    const props = { ...base, caps: { canWrite: false, canReview: true, isEditor: false }, working: { ...base.working!, state: "in_review" as const }, isAssignedReviewer: true };
    const { unmount } = render(<WorkflowPanel {...props} />);
    expect(screen.getByRole("heading", { name: "Your review of version 1" })).toBeDefined();
    expect(screen.getByText(/Review is optional — the author can publish either way/)).toBeDefined();
    unmount();
    render(<WorkflowPanel {...props} editedWorkingRevision />);
    expect(screen.queryByRole("radio", { name: "Approve this version" })).toBeNull();
    expect(screen.getByText(/doesn.t stop anyone publishing it/)).toBeDefined();
  });

  it("the decision is sent with the exact content hash shown", async () => {
    render(<WorkflowPanel {...base} caps={{ canWrite: false, canReview: true, isEditor: false }} working={{ id: "r1", number: 1, state: "in_review", contentHash: "abc123" }} isAssignedReviewer />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })));
    expect(sent(actions.decideAction).get("contentHash")).toBe("abc123");
    expect(sent(actions.decideAction).get("decision")).toBe("approve");
  });

  it("publishing a new version over a live one says what it replaces", () => {
    render(<WorkflowPanel {...base} canPublish caps={editor} working={{ id: "r2", number: 2, state: "draft", contentHash: "h2" }} live={{ id: "r1", number: 1, slug: "first" }} everPublished />);
    fireEvent.click(screen.getByRole("button", { name: "Publish version 2 now" }));
    expect(within(screen.getByRole("alertdialog")).getByText(/replaces version 1 on the public Journal/)).toBeDefined();
    expect(screen.getByText(/nobody needs to approve an article before it is published/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Delete draft" })).toBeNull();
  });

  it("a live version is changed by starting a new version; the live one stays until you publish", () => {
    render(<WorkflowPanel {...base} working={{ id: "r1", number: 1, state: "live", contentHash: "h" }} live={{ id: "r1", number: 1, slug: "x" }} />);
    expect(screen.getByText(/readers keep seeing this one until you publish the new version/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Start a new version" })).toBeDefined();
  });

  it("scheduling is entered in UK time, previewed with UTC, and sent as the wall time", async () => {
    render(<WorkflowPanel {...base} canPublish working={{ id: "r1", number: 1, state: "draft", contentHash: "h" }} />);
    const input = screen.getByLabelText(/Publish at — UK time \(Europe\/London\)/);
    fireEvent.change(input, { target: { value: "2030-07-15T09:00" } });
    expect(screen.getByText(/= .*15 Jul 2030.*09:00 BST \(08:00 UTC\)/)).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Schedule version 1" })));
    expect(sent(actions.scheduleAction).get("atLocal")).toBe("2030-07-15T09:00");
    fireEvent.change(input, { target: { value: "2030-03-31T01:30" } });
    expect(screen.getByText(/doesn't exist in the UK/)).toBeDefined();
  });

  it("a scheduled version says it publishes automatically, shows UK and UTC time, and offers cancelling", () => {
    render(<WorkflowPanel {...base} canPublish caps={editor} working={{ id: "r1", number: 1, state: "draft", contentHash: "h" }} scheduled={{ revisionNumber: 1, at: "2030-01-01T09:00:00Z", by: "Eda" }} />);
    expect(screen.getByText(/will be published automatically on .*09:00 GMT \(09:00 UTC\)/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel schedule" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Publish version/ })).toBeNull();
  });

  it("editors are told plainly when automatic publishing is not running", () => {
    const { unmount } = render(<WorkflowPanel {...base} canPublish caps={editor} scheduler={{ configured: false, active: false, lastRunAt: null, lastStatus: null, overdue: 0 }} />);
    expect(screen.getByRole("alert").textContent).toMatch(/Automatic publishing is NOT set up/);
    unmount();
    render(<WorkflowPanel {...base} canPublish caps={editor} scheduler={{ configured: true, active: true, lastRunAt: "2030-01-01T09:00:00Z", lastStatus: "succeeded", overdue: 2 }} />);
    expect(screen.getByRole("alert").textContent).toMatch(/2 scheduled articles are overdue/);
  });

  it("unsaved edits hold back publishing — only saved content can go live", async () => {
    render(
      <UnsavedChangesProvider>
        <RevisionEditor articleId="a1" revision={revision} categories={[]} media={[]} />
        <WorkflowPanel {...base} canPublish working={{ id: "r1", number: 3, state: "draft", contentHash: "h" }} />
      </UnsavedChangesProvider>,
    );
    expect(screen.getByRole("button", { name: "Publish version 3 now" })).toBeDefined();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Edited" } });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Publish version 3 now" })).toBeNull();
    expect(screen.getByText(/Save your changes before publishing or scheduling/)).toBeDefined();
  });
});

const revision = {
  id: "r1", number: 3, lock_version: 4, title: "First light", slug: "first-light", excerpt: "A start.", body_html: "<p>Body</p>",
  author_name: "Wren", category_id: null, tags: ["light"], featured_media_id: null, featured_alt: null,
  seo_title: null, seo_description: null, canonical_url: null, original_published_at: null,
};
const renderEditor = () =>
  render(
    <UnsavedChangesProvider>
      <RevisionEditor articleId="a1" revision={revision} categories={[]} media={[]} />
    </UnsavedChangesProvider>,
  );

describe("saving with conflict protection (D-128)", () => {
  it("sends the lock version it started from", async () => {
    actions.saveRevisionAction.mockResolvedValueOnce({ ok: true, lockVersion: 5, notice: "Saved." } as never);
    renderEditor();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    const fd = sent(actions.saveRevisionAction, 0);
    expect(fd.get("lockVersion")).toBe("4");
    expect(fd.get("revisionId")).toBe("r1");
  });

  it("a conflict keeps the author's text, names who saved, and only overwrites when chosen", async () => {
    actions.saveRevisionAction.mockResolvedValueOnce({ error: "x", conflict: { by: "Eda Editor", at: "2026-10-14T10:00:00Z", lockVersion: 6 } } as never);
    renderEditor();
    const title = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "My better title" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByRole("alert").textContent).toMatch(/Eda Editor saved it/);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("My better title");
    fireEvent.click(screen.getByRole("button", { name: /Keep mine/ }));
    actions.saveRevisionAction.mockResolvedValueOnce({ ok: true, lockVersion: 7 } as never);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect((sent(actions.saveRevisionAction, 1)).get("lockVersion")).toBe("6");
  });

  it("unsaved changes must be saved before asking for a review", async () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "Ask for a review" })).toBeDefined();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changed" } });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Ask for a review" })).toBeNull();
    expect(screen.getByText("Save your changes before asking for a review.")).toBeDefined();
  });
});

describe("comments, statuses and headings", () => {
  it("comments say they are staff-only", () => {
    render(<CommentsPanel articleId="a1" revisionId="r1" comments={[]} />);
    expect(screen.getByText(/Only Journal staff working on this article can see these. They are never published./)).toBeDefined();
  });

  it("status is always in words", () => {
    render(<JournalStatus status="published" pending="in_review" />);
    expect(screen.getByText("Published")).toBeDefined();
    expect(screen.getByText("New version: in review")).toBeDefined();
  });

  it("headings never skip a level on the article page", () => {
    const { container } = render(
      <UnsavedChangesProvider>
        <main>
          <h1>Article</h1>
          <section><h2>Content</h2><RevisionEditor articleId="a1" revision={revision} categories={[]} media={[]} /></section>
          <section><h2>Workflow</h2><WorkflowPanel {...base} caps={editor} /></section>
          <PeoplePanel articleId="a1" members={[]} writers={[]} canManage={false} />
          <ImagesPanel articleId="a1" media={[]} canEdit />
          <CommentsPanel articleId="a1" revisionId="r1" comments={[]} />
          <section>
            <h2>History</h2>
            <History articleId="a1" revisions={[]} changes={[]} decisions={[]} audit={[]} nameOf={() => "x"} />
          </section>
        </main>
      </UnsavedChangesProvider>,
    );
    const levels = Array.from(container.querySelectorAll("h1,h2,h3,h4")).map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });
});

import type { JournalRevisionState } from "@/types/database";

/**
 * THE SEVEN EDITORIAL STATES, derived (D-126).
 *
 * The database stores two independent facts — what is LIVE (a pointer, plus
 * schedule and archive) and the state of the WORKING revision — because a
 * published article can be under review again at the same time. The display
 * status combines them; `pending` says what is happening to the next version
 * while an article is live.
 *
 * Every status has words. Nothing here is carried by colour alone
 * (Architecture §20).
 */
export type DisplayStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export const REVISION_LABEL: Record<JournalRevisionState, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  live: "Live",
  retired: "Previously live",
  superseded: "Replaced before publishing",
};

export type ArticleFacts = {
  archived_at: string | null;
  live_revision_id: string | null;
  scheduled_for: string | null;
  working_revision_id: string | null;
};

export function articleStatus(
  article: ArticleFacts,
  working: { id: string; state: JournalRevisionState } | null,
): { status: DisplayStatus; pending: DisplayStatus | null } {
  if (article.archived_at) return { status: "archived", pending: null };
  if (article.scheduled_for) return { status: "scheduled", pending: null };

  const workingStatus = working ? fromRevision(working.state) : "draft";
  if (article.live_revision_id) {
    const pending = working && working.id !== article.live_revision_id ? workingStatus : null;
    return { status: "published", pending };
  }
  return { status: workingStatus, pending: null };
}

function fromRevision(state: JournalRevisionState): DisplayStatus {
  switch (state) {
    case "in_review":
      return "in_review";
    case "changes_requested":
      return "changes_requested";
    case "approved":
    case "live":
    case "retired":
      return "approved";
    default:
      return "draft";
  }
}

export function isEditable(state: JournalRevisionState): boolean {
  return state === "draft" || state === "changes_requested";
}

/** Changed-field names from `journal_revision_changes`, in people's words. */
export const FIELD_LABEL: Record<string, string> = {
  title: "title",
  slug: "URL",
  excerpt: "excerpt",
  body: "article text",
  author: "author",
  category: "category",
  tags: "tags",
  featured_image: "featured image",
  seo: "search details",
  dates: "dates",
  import: "imported from Medium",
};

export const AUDIT_LABEL: Record<string, string> = {
  created: "created the article",
  revision_started: "started a new version",
  submitted: "submitted for review",
  withdrawn: "withdrew it from review",
  approved: "approved this version",
  changes_requested: "requested changes",
  reviewer_assigned: "assigned a reviewer",
  reviewer_unassigned: "removed a reviewer",
  member_changed: "changed who can edit",
  published: "published",
  scheduled: "scheduled publication",
  schedule_cancelled: "cancelled the schedule",
  scheduled_published: "published on schedule (automatic)",
  schedule_failed: "the schedule could not publish",
  schedule_retry: "the scheduler hit an error and will retry",
  unpublished: "unpublished",
  archived: "archived",
  unarchived: "restored from the archive",
  imported: "imported from Medium",
  deleted: "deleted the article",
  legacy_backfill: "moved into the editorial workflow",
};

/** Why a scheduled publication was refused (journal_publish_due, D-132). */
export const SCHEDULE_FAILURE: Record<string, string> = {
  not_found: "the scheduled version no longer exists",
  archived: "the article was archived",
  not_working_revision: "a newer version was started",
  not_publishable: "the version is no longer publishable",
  title_required: "the version has no title",
  slug_required: "the version has no URL slug",
  body_required: "the version is empty",
  slug_taken: "its URL is now used by another article",
  changed_since_scheduled: "its content changed after it was scheduled",
  scheduler_not_permitted: "the person who scheduled it can no longer publish it",
  error: "it kept failing with an error (5 attempts)",
};

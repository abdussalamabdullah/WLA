/**
 * Database refusals (raised by journal_* functions) in an editor's words.
 * Unknown errors fall back to a generic message — the raw database text is
 * logged, never shown.
 */
const MESSAGES: Record<string, string> = {
  not_allowed: "You don't have permission to do that.",
  not_found: "That article or version no longer exists.",
  archived: "This article is archived. Restore it before changing it.",
  revision_locked: "This version is locked because it is in review, approved or live. Start a new version to make changes.",
  conflict: "Someone else saved this version since you opened it.",
  title_required: "Add a title first.",
  slug_required: "Add a URL slug first.",
  body_required: "Write the article first.",
  slug_invalid: "That URL slug isn't allowed. Use lower-case letters, numbers and single hyphens.",
  slug_taken: "Another article already uses that URL slug.",
  body_unsafe: "The article contains content that isn't allowed (such as scripts or embedded frames).",
  media_not_in_article: "That image belongs to a different article.",
  withdraw_first: "This version is in review. Withdraw it from review before editing.",
  scheduled: "This version is scheduled to publish, so it is locked. Cancel the schedule to change it.",
  not_in_review: "This version isn't in review.",
  not_assigned: "Only an assigned reviewer can decide on this version.",
  stale_revision: "The version changed after you opened it. Reload and review the current content.",
  own_changes: "You edited this version, so your review of it can't be recorded. (You don't need a review to publish.)",
  note_required: "Say what needs to change.",
  not_a_reviewer: "That person doesn't have the reviewer role.",
  not_a_writer: "That person doesn't have the writer role.",
  not_publishable: "This version can't be published in its current state.",
  not_working_revision: "Only the newest version can be published. Reload to see it.",
  schedule_in_past: "Choose a time at least a few minutes from now.",
  not_live: "This article isn't published.",
  was_published: "An article that has been published can't be deleted. Archive it instead.",
  path_outside_article: "That file doesn't belong to this article.",
  object_missing: "The upload didn't finish. Please try again.",
  invalid_role: "That role isn't recognised.",
  edited: "This article has been edited in WLA, so the import left it alone.",
};

export function journalErrorCode(error: { message?: string } | null | undefined): string | null {
  const text = error?.message ?? "";
  const code = Object.keys(MESSAGES).find((k) => new RegExp(`\\b${k}\\b`).test(text));
  return code ?? null;
}

export function journalErrorMessage(error: { message?: string } | null | undefined): string {
  const code = journalErrorCode(error);
  return code ? MESSAGES[code] : "That didn't work. Please try again.";
}

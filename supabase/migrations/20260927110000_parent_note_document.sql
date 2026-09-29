-- ============================================================================
-- The parent note may be a DOCUMENT as well as text.
--
-- For Parents has so far rendered `mission_parent_notes.content` as prose. The
-- Six Names note is also supplied as a print-ready PDF, and a parent asked to
-- prepare materials is better served by the document than by a web page
-- restating it.
--
-- WHY NOT `mission_resources`
--
-- That table is the Mission Kit — what WLA gives the CHILD. Architecture §8
-- keeps For Parents separate from the Kit, and Brief §17 is explicit that the
-- two must never collapse into one "files" area. Putting the parent note there
-- would list adult guidance among the child's printables.
--
-- WHY NOT `public/`
--
-- Tech Spec §47: no permanent public URLs for mission material. The document
-- lives in the same private `mission-resources` bucket under the mission's own
-- folder, so the existing bucket policy — which re-checks entitlement against
-- `(storage.foldername(name))[1]` — covers it unchanged, with no new policy
-- and no new bucket.
--
-- Nullable: a mission with no document keeps rendering its text note.
-- ============================================================================

alter table mission_parent_notes
  add column if not exists document_path text;

comment on column mission_parent_notes.document_path is
  'Path in the private mission-resources bucket, under the mission id. Served '
  'only as a short-lived signed URL. NULL means the note is text only.';

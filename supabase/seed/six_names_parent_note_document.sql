-- ============================================================================
-- ⚠️  SEEDS ARE APPLY-ONCE (D-37). A NEW file is how an authored change runs.
--
-- Six Names — point For Parents at the supplied print-ready note.
--
-- The PDF lives in the private `mission-resources` bucket under the mission's
-- own folder, exactly like the Mission Kit printables, so the existing bucket
-- policy covers it with no new policy and no new bucket. It is NOT a
-- mission_resources row: that table is the child's Mission Kit, and
-- Architecture §8 keeps For Parents separate from it.
--
-- Idempotent, and it will not overwrite a path set later by a CMS.
-- ============================================================================

update mission_parent_notes
set document_path = m.id || '/six-names-parent-note.pdf',
    updated_at = now()
from missions m
where mission_parent_notes.mission_id = m.id
  and m.slug = 'six-names'
  and mission_parent_notes.document_path is null;

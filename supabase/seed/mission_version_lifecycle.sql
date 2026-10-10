-- ============================================================================
-- Initialise the version lifecycle of every seeded mission (D-111).
--
-- MUST BE THE LAST SEED in [db.seed].sql_paths. On a fresh database the
-- migrations run before the seeds, so the one-off backfills in 20260929100000
-- and 20260929110000 find nothing; this runs the same initialisation once the
-- seeded content exists. See the migration
-- 20261010120000_seeded_mission_version_lifecycle.sql for what it does and
-- what it refuses.
--
-- Safe everywhere: missions that already have a lifecycle are skipped, so on
-- an environment that has run the original backfills this is a no-op.
-- ============================================================================

select private.backfill_mission_version_lifecycle();

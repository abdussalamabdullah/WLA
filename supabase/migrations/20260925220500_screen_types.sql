-- ============================================================================
-- Sprint 9 — additional reusable screen types
--
-- Kept in its own migration because `alter type ... add value` cannot be used
-- by an INSERT inside the same transaction. Seeds that use these values must
-- run after this migration has committed.
--
-- These are TYPES OF INTERACTION, not missions. Each earns its place by being
-- reusable beyond Six Names:
--
--   prepare      — Architecture §10 defines preparation as a distinct state,
--                  separate from a mid-mission physical handoff.
--   multi_choice — select exactly N of M. Six Names uses it for Concern cards.
--   tracker      — a set of labelled positional scales. Reflection, never a
--                  score (Architecture §14, Brief §26).
-- ============================================================================

alter type screen_type add value if not exists 'prepare';
alter type screen_type add value if not exists 'multi_choice';
alter type screen_type add value if not exists 'tracker';

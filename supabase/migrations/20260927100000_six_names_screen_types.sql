-- ============================================================================
-- Screen types required by the SIX NAMES — ACADEMY BUILD BRIEF
--
-- Kept in its own migration because `alter type ... add value` cannot be used
-- by an INSERT inside the same transaction. Seeds that use these values must
-- run after this migration has committed.
--
-- These are TYPES OF INTERACTION, not missions (Tech Spec §62). Each earns its
-- place by describing a reusable interaction rather than a Six Names feature:
--
--   sort_items           — classify a shuffled set of items one at a time
--                          against a fixed set of categories, showing the
--                          authored classification after each selection and
--                          allowing correction before moving on. Six Names
--                          uses it for Seen / Said / Unknown. It is an
--                          orientation activity, never a test: no score is
--                          computed, kept or shown.
--
--   tracker_confirmation — a READ-ONLY statement of the canonical state of a
--                          set of labelled scales for the branch the child is
--                          actually on. Distinct from `tracker`, which the
--                          child manipulates. The Build Brief requires the
--                          Academy to CONFIRM a physical tracker rather than
--                          collect one, and requires the canonical state to be
--                          persisted — so the values live in configuration and
--                          are written server-side, never accepted from the
--                          browser.
--
--   reflection           — read-and-reflect. Shows prompts, and optionally a
--                          set of options the child did NOT choose earlier, so
--                          they can consider one. Collects no text and stores
--                          no answer. It exists precisely so that "think about
--                          this" cannot be implemented as a response screen
--                          that quietly stores what the child typed.
-- ============================================================================

alter type screen_type add value if not exists 'sort_items';
alter type screen_type add value if not exists 'tracker_confirmation';
alter type screen_type add value if not exists 'reflection';

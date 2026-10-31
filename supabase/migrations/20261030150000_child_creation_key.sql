-- ============================================================================
-- ADDING A CHILD IS SAFE TO RETRY (D-144).
--
-- A child can now be added in the middle of buying or redeeming, where a dropped
-- connection or a second click is more likely, and nothing stopped two identical
-- profiles. The form sends a random key made once per attempt; a second insert
-- with the same key for the same parent is refused, and the server answers with
-- the profile that already exists.
--
-- Unique per parent, so one family's key means nothing to another. Null for every
-- existing row and for anything created without a key. Nothing is backfilled.
-- ============================================================================

alter table child_profiles add column creation_key uuid;

create unique index child_profiles_creation_key_idx
  on child_profiles (parent_id, creation_key)
  where creation_key is not null;

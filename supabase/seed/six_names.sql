-- ============================================================================
-- ⚠️  SEEDS ARE APPLY-ONCE. EDITING THIS FILE DOES NOT RE-APPLY IT.
--
-- Observed on 2026-09-26 against the hosted staging project: after adding the
-- price to this file, `supabase db push --include-seed` printed
--
--     Updating seed hash to supabase/seed/six_names.sql...
--
-- and recorded the NEW hash WITHOUT executing the changed contents. The price
-- remained NULL. The CLI tracks applied seeds by hash in
-- supabase_migrations.seed_files; once a file is recorded, a later push can
-- refresh that record rather than re-run the SQL.
--
-- CONSEQUENCE — do not assume a content change has taken effect just because
-- `db push --include-seed` exited successfully. Verify the data.
--
-- For an intentional revision to already-applied content, use one of:
--   * an explicit, auditable UPDATE applied deliberately (as below), or
--   * a NEW seed file added to [db.seed].sql_paths in config.toml, which has
--     no recorded hash and therefore runs, or
--   * a migration, where the change is genuinely schema or is important enough
--     to belong in the ordered migration history.
--
-- This is a CLI behaviour to work around, not an architectural problem. Do not
-- restructure seeding, add tooling, or change the application to solve it.
-- ============================================================================

-- ============================================================================
-- Six Names — mission record, Mission Kit and Parent Note
--
-- Source: "Six Names Mission Note for Parents" (approved) and the four
-- supplied Mission Kit printables.
--
-- WHAT IS DELIBERATELY ABSENT: mission_screens.
-- No Mission Build Brief has been approved for Six Names. The Parent Note
-- describes the mission's SHAPE — two staged decisions, consequences, later
-- Evidence, reconsideration — but not the screen copy, the choice options, the
-- branch targets or the Mission Control content. Brief §60.9 is explicit that
-- mission screens are authored only from an approved Build Brief.
-- See docs/DECISIONS.md → OPEN-03.
-- ============================================================================

insert into missions (
  slug, title, description, lab, min_age, max_age,
  duration, delivery_type, is_free, price_minor, currency, published, version
) values (
  'six-names',
  'Six Names',
  'An unexplained list of six pupils begins to fuel a claim about copying. Decide what to do before anyone knows what the list actually means.',
  'decision',
  11, 15,
  '60–75 mins',
  'hybrid',
  false,
  -- £12.00. Commercial data lives on the mission so no UI hard-codes it (D-09).
  1200,
  'GBP',
  false,   -- unpublished until the full Mission Kit is available and QA passes
  1
)
on conflict (slug) do nothing;

/*
 * The insert above does nothing when the mission already exists, so price
 * changes are applied explicitly — the same pattern six_names_screens.sql uses
 * for completion_rule. This is what makes re-seeding a live mission safe AND
 * effective: identity is created once, commercial data is kept current.
 *
 * `published` is deliberately NOT touched here. It is an operational decision
 * (the Child Mission asset is still outstanding, OPEN-13) and must not be
 * flipped by re-running a seed.
 */
update missions
set price_minor = 1200,
    currency    = 'GBP',
    updated_at  = now()
where slug = 'six-names';

-- ---- Mission Kit (Architecture §7) --------------------------------------
-- storage_path convention: mission-resources/<mission_id>/<file>
-- Upload the artwork to that bucket before enabling the mission.
insert into mission_resources (
  mission_id, title, description, type, storage_path,
  can_view, can_print, can_download, sort_order
)
select m.id, r.title, r.description, 'pdf'::resource_type,
       m.id || '/' || r.file, true, true, true, r.sort_order
from missions m
cross join (values
  ('Child Mission',
   'The mission your child works through.',
   'six-names-child-mission.pdf', 1),
  ('Six Names Mission Board',
   'Six zones to work through as the case develops.',
   'six-names-mission-board.pdf', 2),
  ('What''s Changing? Tracker',
   'Track Spread, Support and Clarity as the case changes. Includes three counters to cut out.',
   'six-names-whats-changing-tracker.pdf', 3),
  ('Concern Cards',
   'Four concerns to weigh before deciding.',
   'six-names-concern-cards.pdf', 4),
  ('Judgement Cards',
   'Three judgement cards and the Final Judgement card.',
   'six-names-judgement-cards.pdf', 5)
) as r(title, description, file, sort_order)
where m.slug = 'six-names'
on conflict do nothing;

-- ---- Mission Note for Parents (Architecture §8) -------------------------
-- Approved copy, reproduced verbatim.
insert into mission_parent_notes (mission_id, content)
select m.id, $note$
## Mission at a glance

**Lab:** Decision Lab
**Ages:** 11–15
**Mission time:** approximately 60–75 minutes
**Delivery:** Hybrid — screen-light
**Rhythm:** Best completed in one sitting, with an optional 5–10 minute pause after the second consequence.

The child works mainly with a printed Mission Board, tracker and cards. The Academy controls the staged information, decisions, consequences and later Evidence so that the child only knows what the case has revealed at each point.

## Before the mission

**WLA supplies:** the Child Mission; Six Names Mission Board; What's Changing? tracker and three counters; four Concern cards; three Judgement cards; Final Judgement card; Academy mission interactions and Mission Control.

**Your child prepares:** print the mission materials; cut out the cards and counters if needed; set out the Mission Board, tracker and cards.

**Please make available:** access to the WLA Academy; a pencil; printer access; scissors if needed.

No other materials are required.

## What your child will do

Your child is placed in a fictional school situation where an unexplained list of six pupils begins to fuel a claim about copying. They must decide what to do before anyone knows what the list actually means.

As the case changes, they track what their choices affect. Later Evidence gives them clearer information, and they decide which earlier decisions they still stand by and which, if any, they would reconsider.

## Safety and privacy

The case is entirely fictional. Your child is not asked to describe a real rumour, accusation or school situation.

No real names, school information, photographs or other identifying information are required.

## Your role

No active role is required.

Avoid explaining what you think the list means or steering your child towards a particular response. The uncertainty and the consequences of their own decisions are part of the mission.

Practical help with printing or cutting is fine if needed.

## What this mission is developing

The mission gives your child practice in making judgements when the full facts are not yet available, noticing the effects of a choice and reconsidering when new evidence changes what is known.

They will practise: distinguishing evidence from an unverified explanation; weighing more than one legitimate concern; considering how a response may affect people and the wider situation; carrying the consequence of one decision into the next; reconsidering a judgement when relevant evidence arrives.

There is no single WLA "correct" response. Different choices protect different concerns and carry different trade-offs.

## Completion and evidence

The mission is complete when your child has made both decisions, followed both consequences, completed the tracker, considered the later Evidence, chosen a Judgement card and completed their Final Judgement.

Their Mission Trail is held through the completed Six Names Mission Board, What's Changing? tracker and final judgement evidence.

No upload is required. Their Mission Trail remains private unless they choose to share part of it.

## What you may notice

Your child may: pause before choosing because more than one concern matters; change what they prioritise after seeing a consequence; distinguish what is known from what is assumed; stand by an earlier decision even after learning that the original claim was wrong; reconsider a decision without treating the earlier choice as simply a mistake.

## One useful prompt

After the mission, you could ask:

*Was there a point when new information changed how you viewed an earlier decision?*
$note$
from missions m
where m.slug = 'six-names'
on conflict (mission_id) do nothing;

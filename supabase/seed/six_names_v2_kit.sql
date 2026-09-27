-- ============================================================================
-- ⚠️  SEEDS ARE APPLY-ONCE (D-37). This is a NEW file so that it runs; the
--     original six_names.sql has a recorded hash and will not re-execute.
--
-- Six Names — Mission Kit and Parent Note, reconciled to the 2026-09-27
-- source documents.
--
-- Authority: "Six Names Child Mission" §PREPARE for what the Kit contains, and
-- "Six Names Mission Note for Parents" for the parent-facing note.
--
-- THE CASE BOARD RENAME IS NOT COSMETIC.
--
-- Version 1 called the printable the "Six Names Mission Board". Every one of
-- the three source documents calls it the CASE BOARD, and "Mission Board" is
-- the name of a deferred Academy-wide destination (Architecture §16, conflict
-- C8 in docs/DECISIONS.md). Keeping the old title left a printable worksheet
-- and an unbuilt Academy feature sharing a name in the child's Mission Kit.
-- The storage path is deliberately NOT renamed: the file in the bucket is the
-- same file, and renaming it would break the Kit for no gain.
-- ============================================================================

do $$
declare
  m uuid;
begin
  select id into m from missions where slug = 'six-names';
  if m is null then
    raise exception 'Seed six_names.sql first';
  end if;

  update mission_resources
  set title = 'Child Mission',
      description = 'The mission your child works through, step by step.',
      sort_order = 1
  where mission_id = m and storage_path like '%six-names-child-mission.pdf';

  update mission_resources
  set title = 'Six Names Case Board',
      description = 'Six zones: the list, your first move, what happened, the list changes, your second move, and what you stand by.',
      sort_order = 2
  where mission_id = m and storage_path like '%six-names-mission-board.pdf';

  update mission_resources
  set title = 'What’s Changing? tracker',
      description = 'Spread, Support and Clarity, with three counters to cut out.',
      sort_order = 3
  where mission_id = m and storage_path like '%six-names-whats-changing-tracker.pdf';

  update mission_resources
  set title = 'Concern cards',
      description = 'Four concerns to weigh before each decision.',
      sort_order = 4
  where mission_id = m and storage_path like '%six-names-concern-cards.pdf';

  update mission_resources
  set title = 'Judgement cards',
      description = 'Three Judgement cards and the Final Judgement card.',
      sort_order = 5
  where mission_id = m and storage_path like '%six-names-judgement-cards.pdf';

  -- --------------------------------------------------------- parent note --
  -- Source: "Six Names Mission Note for Parents" (2026-09-27), condensed to
  -- the sections a parent needs in the Academy. The full note is the printable
  -- in the Mission Kit; this is not a second copy of it.
  update mission_parent_notes
  set content = 'Mission at a glance

Decision Lab · Ages 11–15 · About 60–75 minutes · Hybrid. Best completed in one sitting, with an optional 5–10 minute pause after the second consequence.

Your child works mainly with a printed Case Board, tracker and cards. The Academy reveals information, choices, consequences and later Evidence as the case unfolds.

Before the mission

WLA supplies the Child Mission, the Six Names Case Board, the What’s Changing? tracker and three counters, four Concern cards, three Judgement cards, the Final Judgement card, and the Academy mission interactions and Mission Control.

Have ready: access to the WLA Academy, a pencil, printer access and scissors. Before starting, print the mission materials, cut out the cards and counters, and set out the Case Board, tracker and cards. No other materials are required.

What your child will do

Your child works through a fictional school situation where an unexplained list of six pupils begins to fuel a claim about copying. They decide what to do before anyone knows what the list means. As the case changes, they track what their choices affect. Later Evidence gives them clearer information, and they decide what they still stand by.

Safety and privacy

The case is entirely fictional. Your child is not asked to describe a real rumour, accusation or school situation. No real names, school information, photographs or other identifying information are required.

Your role

You do not need to take an active role. Avoid explaining what you think the list means or steering your child towards a particular response. The uncertainty and the consequences of their own decisions are part of the mission. Practical help with printing or cutting is fine.

What this mission develops

The mission gives your child practice in making judgements before all the facts are known, noticing the effects of a choice and reconsidering when new evidence arrives.

They will practise distinguishing evidence from an unverified explanation; weighing more than one legitimate concern; considering how a response may affect people and the wider situation; carrying the consequence of one decision into the next; and reconsidering a judgement when relevant evidence arrives.

There is no single WLA “correct” response. Different choices protect different concerns and carry different trade-offs.

Completion and evidence

The mission is complete when your child has finished every step. Their completed Six Names Case Board, What’s Changing? tracker and Final Judgement make up their Mission Trail.

No upload is required. Their Mission Trail remains private unless they choose to share part of it.

What you may notice

Your child may pause before choosing because more than one concern matters; change what they prioritise after seeing a consequence; distinguish what is known from what is assumed; or stand by — or reconsider — an earlier decision when new evidence arrives.

One useful prompt

After the mission, you could ask: was there a point when new information changed how you viewed an earlier decision?',
      updated_at = now()
  where mission_id = m;
end $$;

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
  duration, delivery_type, is_free, published, version
) values (
  'six-names',
  'Six Names',
  'An unexplained list of six pupils begins to fuel a claim about copying. Decide what to do before anyone knows what the list actually means.',
  'decision',
  11, 15,
  '60–75 mins',
  'hybrid',
  false,
  false,   -- unpublished until the Build Brief lands and screens exist
  1
)
on conflict (slug) do nothing;

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

-- ============================================================================
-- ⚠️  SEEDS ARE APPLY-ONCE (D-37). A NEW FILE is how an authored change gets
--     applied; editing an already-applied one does not re-run it.
--
-- Six Names — mission screens, VERSION 2
--
-- Source of truth: "SIX NAMES — ACADEMY BUILD BRIEF" (2026-09-27), with the
-- "Six Names Child Mission" as authority for the physical activity and the
-- "Six Names Mission Note for Parents" for the parent-facing material.
-- These supersede Build Brief v0.2, from which version 1 was authored.
--
-- WHY VERSION 2 RATHER THAN AN EDIT TO VERSION 1
--
-- D-17 pins an in-progress run to the mission version it started with. The
-- shape of the mission has changed substantially — the Concern selection is no
-- longer collected, the trackers are confirmations rather than inputs, and the
-- two text responses are gone — so a run pinned to version 1 would break if
-- its screens were rewritten underneath it. Version 1 rows are therefore left
-- exactly as they are, and anything already in progress continues to play the
-- mission it started.
--
-- Copy marked "Show exactly" in the Build Brief is reproduced verbatim. Do not
-- paraphrase it.
--
-- Run AFTER 20260927100000_six_names_screen_types.sql, which adds the
-- sort_items / tracker_confirmation / reflection enum values.
-- ============================================================================

do $$
declare
  m uuid;
begin
  select id into m from missions where slug = 'six-names';
  if m is null then
    raise exception 'Seed six_names.sql first';
  end if;

  -- Idempotent for version 2 only. Version 1 is never touched.
  delete from mission_screens where mission_id = m and version = 2;

  insert into mission_screens (mission_id, version, screen_key, type, sequence, title, body, configuration) values

  -- ====================================================== 1. THE LIST =====
  -- "Present the list as a plain list object with no title, explanation or
  -- signature." The screen therefore carries no body copy at all.
  (m, 2, 'the_list', 'content', 10,
   'The list',
   null,
   jsonb_build_object(
     'listLabel', 'The list, exactly as it appears',
     'listObject', jsonb_build_array(
       jsonb_build_object('text', 'Noor',  'mark', 'none'),
       jsonb_build_object('text', 'Alex',  'mark', 'none'),
       jsonb_build_object('text', 'Sam',   'mark', 'none'),
       jsonb_build_object('text', 'Mika',  'mark', 'none'),
       jsonb_build_object('text', 'Ari',   'mark', 'none'),
       jsonb_build_object('text', 'Remy',  'mark', 'none')
     ),
     'instruction', 'Record the six names in Zone 1 — The List on your Case Board, exactly as shown.',
     'actionLabel', 'Continue',
     'next', 'seen_said_unknown',
     'missionControl', '[]'::jsonb
   )),

  -- ======================================== 2. SEEN / SAID / UNKNOWN ======
  (m, 2, 'seen_said_unknown', 'sort_items', 20,
   'What do you actually know?',
   null,
   jsonb_build_object(
     'prompt', 'Is this something you have seen, something someone said, or something nobody has told you yet?',
     'shuffle', true,
     'categories', jsonb_build_array(
       jsonb_build_object('id', 'seen',    'label', 'Seen'),
       jsonb_build_object('id', 'said',    'label', 'Said'),
       jsonb_build_object('id', 'unknown', 'label', 'Unknown')
     ),
     'items', jsonb_build_array(
       jsonb_build_object('id', 'i1', 'text', 'Six names are written on the paper.', 'classification', 'seen'),
       jsonb_build_object('id', 'i2', 'text', 'The paper has no title.', 'classification', 'seen'),
       jsonb_build_object('id', 'i3', 'text', 'The list is on the board outside the head teacher’s office.', 'classification', 'seen'),
       jsonb_build_object('id', 'i4', 'text', 'Someone says the list is about copying.', 'classification', 'said'),
       jsonb_build_object('id', 'i5', 'text', 'Who wrote the list?', 'classification', 'unknown'),
       jsonb_build_object('id', 'i6', 'text', 'Why are these six names there?', 'classification', 'unknown'),
       jsonb_build_object('id', 'i7', 'text', 'Is the copying claim true?', 'classification', 'unknown')
     ),
     'actionLabel', 'Continue',
     'next', 'handoff_step3',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what I know.',
       'body',  'Read the item again. Did you see this in the case? Did someone say it? Or has the case not told you yet?'
     ))
   )),

  -- ============================ HANDOFF — STEP 3: WHAT MATTERS MOST ======
  -- The physical Concern choice happens here, on the Case Board. The Academy
  -- orchestrates around it and records NOTHING about it.
  (m, 2, 'handoff_step3', 'handoff', 30,
   null,
   null,
   jsonb_build_object(
     'location', 'Complete Step 3 — Choose what matters most.',
     'steps', jsonb_build_array(
       'Look at the four Concern cards.',
       'Choose the concern that matters most to you right now.',
       'Write it in Zone 2 — First Move, then place the matching Concern card there.'
     ),
     'returnInstruction', 'Stuck? Open Mission Control.',
     'returnLabel', 'Continue to Decision 1',
     'next', 'decision1',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I can’t choose a concern.',
       'body',  'You do not need to find the perfect concern. Look at all four cards and ask: Which one matters most to me right now, with what I know so far?'
     ))
   )),

  -- ===================================================== 3. DECISION 1 ====
  (m, 2, 'decision1', 'choice', 40,
   'Decision 1',
   null,
   jsonb_build_object(
     'prompt', 'What do you do?',
     'options', jsonb_build_array(
       jsonb_build_object(
         'id', 'ask_about_list',
         'label', 'Ask about the list',
         'description', 'Go to the office and ask what the list is for.',
         'next', 'consequence1_ask'),
       jsonb_build_object(
         'id', 'stop_claim_spreading',
         'label', 'Stop the claim spreading',
         'description', 'Tell nearby children nobody knows what the list means yet. Ask them not to repeat the claim as though it were true.',
         'next', 'consequence1_stop')
     ),
     'confirmNote', 'Before you confirm, look at your tracker and make a quick prediction: which part or parts do you think might change — Spread, Support or Clarity?',
     'confirmLabel', 'Confirm response',
     'locksOnConfirm', true,
     'missionControl', '[]'::jsonb
   )),

  -- ============================================ 4A. CONSEQUENCE — ASK ====
  (m, 2, 'consequence1_ask', 'content', 50,
   'What happened',
   'The office assistant says the head teacher is in a meeting and cannot answer yet. Pupils notice someone asking about the list. One says: “That proves it must be serious.”',
   jsonb_build_object(
     'instruction', 'Notice whether the part or parts you predicted changed. Move your counters to show what you think the situation is now.',
     'actionLabel', 'Check Academy confirmation',
     'next', 'tracker1_ask',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what changed.',
       'body',  'Read the consequence again. Look at Spread, Support and Clarity one at a time. What do you think each part should show now?'
     ))
   )),

  -- =========================================== 4B. CONSEQUENCE — STOP ====
  (m, 2, 'consequence1_stop', 'content', 51,
   'What happened',
   'Some pupils agree not to repeat the claim. One asks why anyone would defend the named pupils unless they know something. The claim reaches another group, but several pupils now know that nobody has checked what the list means.',
   jsonb_build_object(
     'instruction', 'Notice whether the part or parts you predicted changed. Move your counters to show what you think the situation is now.',
     'actionLabel', 'Check Academy confirmation',
     'next', 'tracker1_stop',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what changed.',
       'body',  'Read the consequence again. Look at Spread, Support and Clarity one at a time. What do you think each part should show now?'
     ))
   )),

  -- ===================================== 5A. TRACKER CONFIRMATION — ASK ==
  (m, 2, 'tracker1_ask', 'tracker_confirmation', 60,
   'What the Academy has',
   null,
   jsonb_build_object(
     'rows', jsonb_build_array(
       jsonb_build_object('label', 'Spread',  'position', 'Groups'),
       jsonb_build_object('label', 'Support', 'position', 'Some support'),
       jsonb_build_object('label', 'Clarity', 'position', 'Guesswork')
     ),
     'canonicalTracker', jsonb_build_object(
       'spread', 'Groups', 'support', 'Some support', 'clarity', 'Guesswork'),
     'instruction', 'Check your tracker against this and correct it if you need to. Then write one short line in Zone 3 — What Happened.',
     'actionLabel', 'Continue to Changed List',
     'next', 'changed_list',
     'missionControl', '[]'::jsonb
   )),

  -- ==================================== 5B. TRACKER CONFIRMATION — STOP ==
  (m, 2, 'tracker1_stop', 'tracker_confirmation', 61,
   'What the Academy has',
   null,
   jsonb_build_object(
     'rows', jsonb_build_array(
       jsonb_build_object('label', 'Spread',  'position', 'Groups'),
       jsonb_build_object('label', 'Support', 'position', 'Clearly supported'),
       jsonb_build_object('label', 'Clarity', 'position', 'Guesswork')
     ),
     'canonicalTracker', jsonb_build_object(
       'spread', 'Groups', 'support', 'Clearly supported', 'clarity', 'Guesswork'),
     'instruction', 'Check your tracker against this and correct it if you need to. Then write one short line in Zone 3 — What Happened.',
     'actionLabel', 'Continue to Changed List',
     'next', 'changed_list',
     'missionControl', '[]'::jsonb
   )),

  -- ================================================= 6. THE CHANGED LIST ==
  (m, 2, 'changed_list', 'content', 70,
   'The list has changed',
   null,
   jsonb_build_object(
     'listLabel', 'The list, as it now reads',
     'listObject', jsonb_build_array(
       jsonb_build_object('text', 'Noor', 'mark', 'none'),
       jsonb_build_object('text', 'Alex', 'mark', 'none'),
       jsonb_build_object('text', 'Sam',  'mark', 'none'),
       jsonb_build_object('text', 'Mika', 'mark', 'struck'),
       jsonb_build_object('text', 'Ari',  'mark', 'none'),
       jsonb_build_object('text', 'Remy', 'mark', 'none'),
       jsonb_build_object('text', 'Jude', 'mark', 'added'),
       jsonb_build_object('text', 'Zain', 'mark', 'added')
     ),
     'instruction', 'Record it in Zone 4 — The List Changes, exactly as shown. Do not treat the change itself as an explanation.',
     'actionLabel', 'Continue',
     'next', 'ssu_revisit',
     'missionControl', '[]'::jsonb
   )),

  -- ====================================== 7. SEEN / SAID / UNKNOWN REVISIT
  -- Deliberately NOT the sorting interaction again, and deliberately without
  -- an answer key: three questions to hold while looking at the Case Board.
  (m, 2, 'ssu_revisit', 'content', 80,
   'Look again',
   null,
   jsonb_build_object(
     'reflectionPrompts', jsonb_build_array(
       'What has visibly changed?',
       'What is still only said?',
       'What remains unknown?'
     ),
     'actionLabel', 'Continue',
     'next', 'handoff_step7',
     'missionControl', '[]'::jsonb
   )),

  -- ============================= HANDOFF — STEP 7: WHAT MATTERS NOW =======
  (m, 2, 'handoff_step7', 'handoff', 90,
   null,
   null,
   jsonb_build_object(
     'location', 'Complete Step 7 — Choose what matters now.',
     'steps', jsonb_build_array(
       'Look again at the four Concern cards.',
       'You may keep your first concern or choose a different one.',
       'Write it in Zone 5 — Second Move, then place the matching Concern card there.'
     ),
     'returnInstruction', 'Stuck? Open Mission Control.',
     'returnLabel', 'Continue to Decision 2',
     'next', 'decision2',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what matters now.',
       'body',  'Start with what changed after your first decision. Then look at the four Concern cards again. You can keep your first concern or choose a different one.'
     ))
   )),

  -- ===================================================== 8. DECISION 2 ====
  (m, 2, 'decision2', 'choice', 100,
   'Decision 2',
   null,
   jsonb_build_object(
     'prompt', 'What do you do now?',
     'options', jsonb_build_array(
       jsonb_build_object(
         'id', 'ask_everyone_pause',
         'label', 'Ask everyone to pause',
         'description', 'Ask nearby groups to stop treating the list as proof until someone explains it.',
         'next', 'consequence2_pause'),
       jsonb_build_object(
         'id', 'share_the_role',
         'label', 'Continue, but share the role',
         'description', 'Continue the project task, but share Noor’s role with someone else until the list is explained.',
         'next', 'consequence2_share'),
       jsonb_build_object(
         'id', 'noor_steps_away',
         'label', 'Suggest Noor steps away',
         'description', 'Suggest that Noor temporarily steps away from the project role until the list is explained.',
         'next', 'consequence2_step_away')
     ),
     'confirmNote', 'Before you confirm, look at your tracker and make another quick prediction: which part or parts do you think might change — Spread, Support or Clarity?',
     'confirmLabel', 'Confirm response',
     'locksOnConfirm', true,
     'missionControl', '[]'::jsonb
   )),

  -- ========================================== 9A. CONSEQUENCE — PAUSE ====
  (m, 2, 'consequence2_pause', 'content', 110,
   'What happened next',
   'Some agree that the list proves nothing. Others say refusing to act may allow copying to go unchallenged. The disagreement reaches nearly everyone involved in the project.',
   jsonb_build_object(
     'instruction', 'Notice whether the part or parts you predicted changed. Move your counters to show what you think the situation is now.',
     'actionLabel', 'Check Academy confirmation',
     'next', 'tracker2_pause',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what changed.',
       'body',  'Read the consequence again. Look at Spread, Support and Clarity one at a time. What do you think each part should show now?'
     ))
   )),

  -- ========================================== 9B. CONSEQUENCE — SHARE ====
  (m, 2, 'consequence2_share', 'content', 111,
   'What happened next',
   'Noor stays involved, but another pupil shares the role. Some people see this as a fair temporary solution. Others assume the shared role confirms that something suspicious happened.',
   jsonb_build_object(
     'instruction', 'Notice whether the part or parts you predicted changed. Move your counters to show what you think the situation is now.',
     'actionLabel', 'Check Academy confirmation',
     'next', 'tracker2_share',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what changed.',
       'body',  'Read the consequence again. Look at Spread, Support and Clarity one at a time. What do you think each part should show now?'
     ))
   )),

  -- ===================================== 9C. CONSEQUENCE — STEPS AWAY ====
  (m, 2, 'consequence2_step_away', 'content', 112,
   'What happened next',
   'Noor steps away from the project role. Some pupils say this protects the project. Others treat the removal as proof that the accusation must be true.',
   jsonb_build_object(
     'instruction', 'Notice whether the part or parts you predicted changed. Move your counters to show what you think the situation is now.',
     'actionLabel', 'Check Academy confirmation',
     'next', 'tracker2_step_away',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what changed.',
       'body',  'Read the consequence again. Look at Spread, Support and Clarity one at a time. What do you think each part should show now?'
     ))
   )),

  -- ================================== 10A. TRACKER CONFIRMATION — PAUSE ==
  (m, 2, 'tracker2_pause', 'tracker_confirmation', 120,
   'What the Academy has',
   null,
   jsonb_build_object(
     'rows', jsonb_build_array(
       jsonb_build_object('label', 'Spread',  'position', 'Nearly everyone'),
       jsonb_build_object('label', 'Support', 'position', 'Clearly supported'),
       jsonb_build_object('label', 'Clarity', 'position', 'Guesswork')
     ),
     'canonicalTracker', jsonb_build_object(
       'spread', 'Nearly everyone', 'support', 'Clearly supported', 'clarity', 'Guesswork'),
     'instruction', 'Check your tracker against this and correct it if you need to. Then write one short line in Zone 5 — Second Move.',
     'actionLabel', 'Continue',
     'next', 'stopping_point',
     'missionControl', '[]'::jsonb
   )),

  -- ================================== 10B. TRACKER CONFIRMATION — SHARE ==
  (m, 2, 'tracker2_share', 'tracker_confirmation', 121,
   'What the Academy has',
   null,
   jsonb_build_object(
     'rows', jsonb_build_array(
       jsonb_build_object('label', 'Spread',  'position', 'Nearly everyone'),
       jsonb_build_object('label', 'Support', 'position', 'Some support'),
       jsonb_build_object('label', 'Clarity', 'position', 'Guesswork')
     ),
     'canonicalTracker', jsonb_build_object(
       'spread', 'Nearly everyone', 'support', 'Some support', 'clarity', 'Guesswork'),
     'instruction', 'Check your tracker against this and correct it if you need to. Then write one short line in Zone 5 — Second Move.',
     'actionLabel', 'Continue',
     'next', 'stopping_point',
     'missionControl', '[]'::jsonb
   )),

  -- ============================= 10C. TRACKER CONFIRMATION — STEPS AWAY ==
  (m, 2, 'tracker2_step_away', 'tracker_confirmation', 122,
   'What the Academy has',
   null,
   jsonb_build_object(
     'rows', jsonb_build_array(
       jsonb_build_object('label', 'Spread',  'position', 'Nearly everyone'),
       jsonb_build_object('label', 'Support', 'position', 'Alone'),
       jsonb_build_object('label', 'Clarity', 'position', 'Guesswork')
     ),
     'canonicalTracker', jsonb_build_object(
       'spread', 'Nearly everyone', 'support', 'Alone', 'clarity', 'Guesswork'),
     'instruction', 'Check your tracker against this and correct it if you need to. Then write one short line in Zone 5 — Second Move.',
     'actionLabel', 'Continue',
     'next', 'stopping_point',
     'missionControl', '[]'::jsonb
   )),

  -- ============================================ 11. GOOD STOPPING POINT ==
  (m, 2, 'stopping_point', 'content', 130,
   'Good stopping point',
   'If you need a break, you can pause here.',
   jsonb_build_object(
     'actionLabel', 'Continue',
     -- Leaves the mission rather than advancing it. The position is already
     -- persisted, so pausing writes nothing and cannot fail.
     'secondaryAction', 'Pause Mission',
     'next', 'evidence',
     'missionControl', '[]'::jsonb
   )),

  -- ======================================================= 12. EVIDENCE ==
  -- A `reveal`, so the body is not sent to the browser until the child opens
  -- it. Opening it is also what sets Clarity — server-side, from the
  -- canonicalTracker below, never from anything the browser reports.
  (m, 2, 'evidence', 'reveal', 140,
   'Evidence',
   null,
   jsonb_build_object(
     'concealedPrompt', 'Open Evidence',
     'revealLabel', 'Open Evidence',
     'revealedTitle', 'PROJECT EQUIPMENT CHECK',
     'revealedBody', 'The names belonged to pupils whose team-equipment records still needed checking. A crossed-out name meant the record had been completed. Jude and Zain were added because their equipment forms arrived late. The list was not about copying. A real issue still remained: several equipment records were incomplete and needed correcting.',
     'reflectionPrompts', jsonb_build_array(
       'What does this evidence explain?',
       'What does it not undo?'
     ),
     'condition', jsonb_build_object('type', 'child_action'),
     'canonicalTracker', jsonb_build_object('clarity', 'Purpose clear'),
     'next', 'handoff_step11',
     'missionControl', '[]'::jsonb
   )),

  -- ======================= HANDOFF — STEP 11: WHAT YOU STAND BY ==========
  (m, 2, 'handoff_step11', 'handoff', 150,
   null,
   null,
   jsonb_build_object(
     'location', 'Complete Step 11 — Decide what you stand by.',
     'steps', jsonb_build_array(
       'Look across your Case Board from the beginning.',
       'Choose the Judgement card that best matches your view.',
       'Place it in Zone 6 — What Do You Stand By?'
     ),
     'returnInstruction', 'Stuck? Open Mission Control.',
     'returnLabel', 'Continue to Judgement',
     'next', 'judgement',
     'missionControl', jsonb_build_array(jsonb_build_object(
       'title', 'I’m not sure what I stand by.',
       'body',  'Take the two decisions one at a time. What did you know when you made each one? What was each choice trying to protect? Then choose the Judgement card that best matches your view now.'
     ))
   )),

  -- ========================================== 13. WHAT DO YOU STAND BY ===
  (m, 2, 'judgement', 'choice', 160,
   'What do you stand by?',
   null,
   jsonb_build_object(
     'prompt', 'Select the Judgement card you placed on your Case Board.',
     'options', jsonb_build_array(
       jsonb_build_object('id', 'stand_by_both',    'label', 'I stand by both decisions.',      'next', 'reflection_both'),
       jsonb_build_object('id', 'reconsider_one',   'label', 'I would reconsider Decision 1.',  'next', 'reflection_d1'),
       jsonb_build_object('id', 'reconsider_two',   'label', 'I would reconsider Decision 2.',  'next', 'reflection_d2')
     ),
     'confirmLabel', 'Confirm',
     'locksOnConfirm', true,
     'missionControl', '[]'::jsonb
   )),

  -- ================================= 14A. REFLECTION — STAND BY BOTH =====
  (m, 2, 'reflection_both', 'reflection', 170,
   null,
   null,
   jsonb_build_object(
     'prompts', jsonb_build_array('Why do you still stand by both decisions?'),
     'actionLabel', 'Continue',
     'next', 'final_judgement',
     'missionControl', '[]'::jsonb
   )),

  -- ============================ 14B. REFLECTION — RECONSIDER DECISION 1 ==
  -- The unchosen Decision 1 LABEL only. Its consequence lives on its own
  -- screen and is never fetched, so there is nothing here to leak.
  (m, 2, 'reflection_d1', 'reflection', 171,
   null,
   'The response you did not choose:',
   jsonb_build_object(
     'unusedFrom', 'decision1',
     'unusedOptions', jsonb_build_array(
       jsonb_build_object('id', 'ask_about_list',       'label', 'Ask about the list'),
       jsonb_build_object('id', 'stop_claim_spreading', 'label', 'Stop the claim spreading')
     ),
     'selectable', false,
     'prompts', jsonb_build_array(
       'What might that choice have helped?',
       'What might still have been difficult?'
     ),
     'actionLabel', 'Continue',
     'next', 'final_judgement',
     'missionControl', '[]'::jsonb
   )),

  -- ============================ 14C. REFLECTION — RECONSIDER DECISION 2 ==
  (m, 2, 'reflection_d2', 'reflection', 172,
   null,
   'The responses you did not choose:',
   jsonb_build_object(
     'unusedFrom', 'decision2',
     'unusedPrompt', 'Which one would you now consider?',
     'unusedOptions', jsonb_build_array(
       jsonb_build_object('id', 'ask_everyone_pause', 'label', 'Ask everyone to pause'),
       jsonb_build_object('id', 'share_the_role',     'label', 'Continue, but share the role'),
       jsonb_build_object('id', 'noor_steps_away',    'label', 'Suggest Noor steps away')
     ),
     -- Selectable, but the selection has nowhere to go: no interaction kind
     -- carries it, so it cannot be stored even by accident.
     'selectable', true,
     'prompts', jsonb_build_array(
       'What might that choice have helped?',
       'What might still have been difficult?'
     ),
     'actionLabel', 'Continue',
     'next', 'final_judgement',
     'missionControl', '[]'::jsonb
   )),

  -- ================================================ 15. FINAL JUDGEMENT ==
  -- Content, not response. The Final Judgement is written on the physical
  -- card; the Academy must not repeat the prompts, offer a text box, or ask
  -- for an upload.
  (m, 2, 'final_judgement', 'content', 180,
   'Final Judgement',
   'Complete your Final Judgement and Grow in the Child Mission. Return here when you are finished.',
   jsonb_build_object(
     'actionLabel', 'Complete Mission',
     'next', 'complete',
     'missionControl', '[]'::jsonb
   )),

  -- ================================================ 16. MISSION COMPLETE =
  (m, 2, 'complete', 'completion', 190,
   'Mission Complete',
   'Your Six Names Case Board and What’s Changing? tracker are your Mission Trail.

Your Mission Trail is private unless you choose to share part of it.',
   jsonb_build_object(
     'message', 'Your Six Names Case Board and What’s Changing? tracker are your Mission Trail.',
     'trailSummary', 'Your Mission Trail is private unless you choose to share part of it.',
     -- PHYSICAL ONLY. Nothing was uploaded and nothing was captured; these
     -- record that the artefacts belong to the Trail, and never imply the
     -- Academy holds a copy.
     'trailEntries', jsonb_build_array(
       jsonb_build_object('type', 'physical', 'title', 'Six Names Case Board',
         'description', 'Your completed Case Board — the list, your two moves, what happened, and what you stand by.'),
       jsonb_build_object('type', 'physical', 'title', 'What’s Changing? tracker',
         'description', 'Your tracker, showing Spread, Support and Clarity as the case changed.'),
       jsonb_build_object('type', 'physical', 'title', 'Final Judgement card',
         'description', 'Your completed Final Judgement card, placed in Zone 6 of your Case Board.')
     )
   ));

  -- ------------------------------------------------------ mission record --
  -- Point new runs at version 2 and replace the completion rule.
  --
  -- `screen_visited: final_judgement` is load-bearing. Without it every other
  -- condition is already satisfied the moment the Judgement card is confirmed,
  -- and the mission would complete from Screen 13 — skipping the reflection
  -- and the Final Judgement entirely.
  update missions
  set version = 2,
      completion_rule = jsonb_build_object(
        'type', 'conditions',
        'conditions', jsonb_build_array(
          jsonb_build_object('kind', 'choice_exists',  'screenKey', 'decision1'),
          jsonb_build_object('kind', 'choice_exists',  'screenKey', 'decision2'),
          jsonb_build_object('kind', 'screen_visited', 'screenKey', 'evidence'),
          jsonb_build_object('kind', 'choice_exists',  'screenKey', 'judgement'),
          jsonb_build_object('kind', 'screen_visited', 'screenKey', 'final_judgement')
        )
      ),
      updated_at = now()
  where id = m;
end $$;

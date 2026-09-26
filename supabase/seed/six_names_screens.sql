-- ============================================================================
-- Six Names — mission screens (version 1)
--
-- Source: Six Names Mission Build Brief v0.2 §4 (child-facing copy) and §5
-- (screen sequence). Copy is reproduced as supplied.
--
-- STATUS: the brief's §11 lists eight items awaiting WLA content approval, and
-- §12 states the narrative "must not be treated as existing WLA copy until
-- approved". Because content is data, a revision is an edit to THIS FILE — no
-- engine or component change is required (C9-6).
--
-- Run AFTER migration 0006, which adds the prepare / multi_choice / tracker
-- enum values.
-- ============================================================================

do $$
declare
  m uuid;
begin
  select id into m from missions where slug = 'six-names';
  if m is null then
    raise exception 'Seed six_names.sql first';
  end if;

  delete from mission_screens where mission_id = m and version = 1;

  -- =========================================================== 1. BRIEF ====
  insert into mission_screens (mission_id, version, screen_key, type, sequence, title, body, configuration) values
  (m, 1, 'mission_brief', 'content', 10,
   'Six Names',
   'A sheet of paper has turned up with six pupil names on it.

By lunchtime, a claim is spreading: the six pupils copied part of a group project from another group.

Nobody has shown you the full evidence. You know the names are on the sheet. You know people are talking about what the sheet means. You do not yet know why the names are there.

You have two decisions to make. What you do first will affect what happens next.',
   jsonb_build_object(
     'instruction', 'MISSION RULE: You will not get the full story at once. Work with what you know now. Do not treat a guess as a fact.',
     'actionLabel', 'Start',
     'missionControl', '[]'::jsonb
   )),

  -- ========================================================= 2. PREPARE ====
  (m, 1, 'prepare', 'prepare', 20,
   'Before you begin',
   'Set out your materials. You will work mostly on paper — the Academy just keeps the case moving.',
   jsonb_build_object(
     'materials', jsonb_build_array(
       'The Six Names Mission Board',
       'The What''s Changing? tracker and its three counters',
       'The four Concern cards',
       'The three Judgement cards and the Final Judgement card',
       'A pencil'
     ),
     'cautions', jsonb_build_array(
       'Do not turn over or read any cards until the Academy tells you to.',
       'You do not need to enter any real names or information about your own school.'
     ),
     'readyLabel', 'I''m ready',
     'missionControl', '[]'::jsonb
   )),

  -- ========================================================== 3. ZONE 1 ====
  (m, 1, 'zone1_list', 'content', 30,
   'Zone 1 — The List',
   'A handwritten sheet was found in a classroom folder after a group project was submitted.

Six pupil names are written on it.

A message is being passed around saying that the six pupils copied part of another group''s project.

One person says the list proves who copied. Another person says nobody has checked what the list was actually for.

The teacher has not confirmed what the list means. The project is due to be reviewed that afternoon.',
   jsonb_build_object(
     'instruction', 'On Zone 1, write down only what is known. Do not write what you think the list means.',
     'actionLabel', 'I''ve written what is known',
     'missionControl', jsonb_build_array(
       jsonb_build_object('title', 'What do I know?', 'body', 'Look back at what you have actually been told. Facts are the things someone could show you.'),
       jsonb_build_object('title', 'What am I assuming?', 'body', 'An assumption is something that feels true but has not been checked. It is fine to have one — just keep it separate.'),
       jsonb_build_object('title', 'Is that everything?', 'body', 'No. More information may be revealed later in this mission.')
     )
   )),

  -- ================================================== 4. DECISION 1 CONCERNS
  (m, 1, 'decision1_concerns', 'multi_choice', 40,
   'What matters most right now?',
   'Before you know what the list means, decide which concerns you are trying to protect.',
   jsonb_build_object(
     'prompt', 'Choose TWO Concern cards.',
     'selectExactly', 2,
     'instruction', 'Take the two matching Concern cards and put them beside Zone 2.',
     'options', jsonb_build_array(
       jsonb_build_object('id', 'stop_unfair_claim', 'label', 'Stop an unfair claim'),
       jsonb_build_object('id', 'find_out_meaning', 'label', 'Find out what the list means'),
       jsonb_build_object('id', 'protect_project', 'label', 'Protect the project'),
       jsonb_build_object('id', 'avoid_growing_rumour', 'label', 'Avoid making the rumour bigger')
     ),
     'missionControl', jsonb_build_array(
       jsonb_build_object('title', 'What do I know?', 'body', 'More than one concern can matter at the same time. You are choosing which two you are protecting first.'),
       jsonb_build_object('title', 'What am I assuming?', 'body', 'Notice whether you are choosing based on what is known, or on what you think the list means.')
     )
   )),

  -- ====================================================== 5. DECISION 1 MOVE
  (m, 1, 'decision1_move', 'choice', 50,
   'Decision 1 — First Move',
   NULL,
   jsonb_build_object(
     'prompt', 'What do you do first?',
     'instruction', 'Record your first move on Zone 2.',
     'locksOnConfirm', false,
     'options', jsonb_build_array(
       jsonb_build_object('id', 'a', 'next', 'consequence1_a', 'label', 'Pause the claim — ask that the copying claim be paused until someone checks what the list actually is. Do not name or confront the six pupils.'),
       jsonb_build_object('id', 'b', 'next', 'consequence1_b', 'label', 'Find the meaning first — quietly ask the person who found the list where it came from and what they know about it before the claim is repeated further.'),
       jsonb_build_object('id', 'c', 'next', 'consequence1_c', 'label', 'Protect the project first — keep the project review moving while making clear that the copying claim is not established fact and should not be treated as proof.')
     ),
     'missionControl', jsonb_build_array(
       jsonb_build_object('title', 'What do I know?', 'body', 'You know the names are on a sheet and that a claim is spreading. You do not know what the sheet was for.'),
       jsonb_build_object('title', 'What am I assuming?', 'body', 'Each move protects something different. None of them is the safe answer.')
     )
   )),

  -- ================================================== 6-8. CONSEQUENCE 1 ====
  (m, 1, 'consequence1_a', 'content', 60,
   'Zone 3 — What Happened',
   'The rumour slows down, but the project review is delayed and some pupils feel that a concern about copying is being ignored.

The case now needs a clearer way to separate ''something was raised'' from ''the claim is true.''',
   jsonb_build_object('next', 'tracker1', 'instruction', 'Record what happened on Zone 3.', 'actionLabel', 'I''ve recorded it', 'missionControl', '[]'::jsonb)),

  (m, 1, 'consequence1_b', 'content', 61,
   'Zone 3 — What Happened',
   'The person who found the list cannot explain it yet.

Because the question stayed narrow, the rumour does not grow as quickly, but the six pupils are still being talked about while the project deadline approaches.',
   jsonb_build_object('next', 'tracker1', 'instruction', 'Record what happened on Zone 3.', 'actionLabel', 'I''ve recorded it', 'missionControl', '[]'::jsonb)),

  (m, 1, 'consequence1_c', 'content', 62,
   'Zone 3 — What Happened',
   'The project review continues, but the copying claim travels further.

Some pupils begin treating the six names as proof even though nobody has established what the list means.',
   jsonb_build_object('next', 'tracker1', 'instruction', 'Record what happened on Zone 3.', 'actionLabel', 'I''ve recorded it', 'missionControl', '[]'::jsonb)),

  -- ======================================================== 9. TRACKER 1 ====
  (m, 1, 'tracker1', 'tracker', 70,
   'What''s Changing?',
   NULL,
   jsonb_build_object(
     'prompt', 'Based on what just happened, where would you place Spread, Support and Clarity now?',
     'instruction', 'Move the three counters on your tracker to match.',
     'required', true,
     'next', 'list_changes',
     'dimensions', jsonb_build_array(
       jsonb_build_object('id', 'spread', 'label', 'Spread', 'positions', jsonb_build_array('Few', 'Groups', 'Nearly everyone')),
       jsonb_build_object('id', 'support', 'label', 'Support', 'positions', jsonb_build_array('Alone', 'Some support', 'Clearly supported')),
       jsonb_build_object('id', 'clarity', 'label', 'Clarity', 'positions', jsonb_build_array('Guesswork', 'Some facts', 'Purpose clear'))
     ),
     'missionControl', '[]'::jsonb
   )),

  -- ==================================================== 10. LIST CHANGES ====
  (m, 1, 'list_changes', 'content', 80,
   'Zone 4 — The List Changes',
   'The sheet was not created to identify pupils who copied.

It was a working list used during the project process to keep track of contributions, source checks and parts that still needed checking. The six names were later read out of context and connected to the copying claim.

This changes what the list can reasonably be used as evidence for. It does not answer every question about the project.',
   jsonb_build_object(
     'instruction', 'On Zone 4, record what changed. Separate what you now know from what you are still assuming.',
     'actionLabel', 'I''ve recorded what changed',
     'missionControl', jsonb_build_array(
       jsonb_build_object('title', 'What do I know?', 'body', 'You now know what the list was for. That is new.'),
       jsonb_build_object('title', 'What am I assuming?', 'body', 'Knowing what the list was for is not the same as knowing what happened with the project.'),
       jsonb_build_object('title', 'Is that everything?', 'body', 'No. There is more to come.')
     )
   )),

  -- ================================================= 11. DECISION 2 CONCERNS
  (m, 1, 'decision2_concerns', 'multi_choice', 90,
   'What matters most now?',
   'You know more than you did. Choose again — you may pick the same concerns or different ones.',
   jsonb_build_object(
     'prompt', 'Choose TWO Concern cards.',
     'selectExactly', 2,
     'instruction', 'Take the two matching Concern cards and put them beside Zone 5.',
     'options', jsonb_build_array(
       jsonb_build_object('id', 'stop_unfair_claim', 'label', 'Stop an unfair claim'),
       jsonb_build_object('id', 'find_out_meaning', 'label', 'Find out what the list means'),
       jsonb_build_object('id', 'protect_project', 'label', 'Protect the project'),
       jsonb_build_object('id', 'avoid_growing_rumour', 'label', 'Avoid making the rumour bigger')
     ),
     'missionControl', jsonb_build_array(
       jsonb_build_object('title', 'What do I know?', 'body', 'What the list was actually for. What people have already said about it.'),
       jsonb_build_object('title', 'What am I assuming?', 'body', 'You may be protecting something different now. That is allowed.')
     )
   )),

  -- ===================================================== 12. DECISION 2 MOVE
  (m, 1, 'decision2_move', 'choice', 100,
   'Decision 2 — Second Move',
   NULL,
   jsonb_build_object(
     'prompt', 'You now know more about the list. What should happen next?',
     'instruction', 'Record your second move on Zone 5.',
     'locksOnConfirm', false,
     'options', jsonb_build_array(
       jsonb_build_object('id', 'a', 'next', 'consequence2_a', 'label', 'Correct the claim — say clearly that the list does not prove copying and ask that the claim not be repeated as fact.'),
       jsonb_build_object('id', 'b', 'next', 'consequence2_b', 'label', 'Check the project evidence — go back to the actual project material and compare the parts that were questioned, rather than treating either the list or the rumour as proof.'),
       jsonb_build_object('id', 'c', 'next', 'consequence2_c', 'label', 'Leave the claim aside — accept that the list was misunderstood and move on without reopening the issue unless stronger evidence appears later.')
     ),
     'missionControl', jsonb_build_array(
       jsonb_build_object('title', 'What do I know?', 'body', 'The list was a working document. The claim grew from a misreading of it.'),
       jsonb_build_object('title', 'What am I assuming?', 'body', 'Whether correcting the record, checking the work, or leaving it alone does more good here.')
     )
   )),

  -- ================================================ 13-15. CONSEQUENCE 2 ====
  (m, 1, 'consequence2_a', 'content', 110,
   'Zone 5 — What Happened Next',
   'The rumour loses some force, but the pupils who first repeated it feel challenged.

The group now has to deal with the effect of the accusation itself.',
   jsonb_build_object('next', 'tracker2', 'instruction', 'Record what happened on Zone 5.', 'actionLabel', 'I''ve recorded it', 'missionControl', '[]'::jsonb)),

  (m, 1, 'consequence2_b', 'content', 111,
   'Zone 5 — What Happened Next',
   'The group gets a clearer picture of what happened.

Some questioned material has an explanation, but one part of the project still needs clarification.',
   jsonb_build_object('next', 'tracker2', 'instruction', 'Record what happened on Zone 5.', 'actionLabel', 'I''ve recorded it', 'missionControl', '[]'::jsonb)),

  (m, 1, 'consequence2_c', 'content', 112,
   'Zone 5 — What Happened Next',
   'Immediate tension drops, but some people continue to believe the original claim because nobody corrected it directly.',
   jsonb_build_object('next', 'tracker2', 'instruction', 'Record what happened on Zone 5.', 'actionLabel', 'I''ve recorded it', 'missionControl', '[]'::jsonb)),

  -- ======================================================= 16. TRACKER 2 ====
  (m, 1, 'tracker2', 'tracker', 120,
   'What''s Changing?',
   NULL,
   jsonb_build_object(
     'prompt', 'Place Spread, Support and Clarity where you now think they belong. This is reflection, not a score.',
     'instruction', 'Move the three counters one more time.',
     'required', true,
     'next', 'later_evidence',
     'dimensions', jsonb_build_array(
       jsonb_build_object('id', 'spread', 'label', 'Spread', 'positions', jsonb_build_array('Few', 'Groups', 'Nearly everyone')),
       jsonb_build_object('id', 'support', 'label', 'Support', 'positions', jsonb_build_array('Alone', 'Some support', 'Clearly supported')),
       jsonb_build_object('id', 'clarity', 'label', 'Clarity', 'positions', jsonb_build_array('Guesswork', 'Some facts', 'Purpose clear'))
     ),
     'missionControl', '[]'::jsonb
   )),

  -- =================================================== 17. LATER EVIDENCE ====
  (m, 1, 'later_evidence', 'content', 130,
   'Later Evidence',
   'The six-name sheet was a contribution and checking list used during the project. It was not a list of pupils accused of copying.

The copying claim began when someone saw the six names beside a project section and assumed the list identified pupils involved in copying.

The project evidence shows that several of the six pupils had used common source material. This explains some similarities but does not by itself prove that they copied from the other group.

One part of the project still needs clarification, which is why checking the actual work is more informative than treating the list as proof.

By the time the meaning of the list was understood, the rumour had already affected how some pupils were being viewed.',
   jsonb_build_object(
     'instruction', 'Read the Evidence carefully. You may keep an earlier decision, reconsider it, or recognise that a decision protected one concern while creating another consequence.',
     'actionLabel', 'I''ve read it',
     'missionControl', jsonb_build_array(
       jsonb_build_object('title', 'What do I know?', 'body', 'You now have the fuller record. Compare it with what you wrote in Zone 1.'),
       jsonb_build_object('title', 'What am I assuming?', 'body', 'New evidence can change what a decision was worth without making the earlier decision foolish.')
     )
   )),

  -- ======================================================== 18. JUDGEMENT ====
  (m, 1, 'judgement_card', 'choice', 140,
   'Judgement',
   'Look at your two decisions again, knowing what you know now.',
   jsonb_build_object(
     'prompt', 'Which Judgement card do you choose?',
     'instruction', 'Take the matching physical Judgement card.',
     'locksOnConfirm', false,
     'options', jsonb_build_array(
       jsonb_build_object('id', 'stand_by_both', 'label', 'I stand by both decisions'),
       jsonb_build_object('id', 'reconsider_1', 'label', 'I would reconsider Decision 1'),
       jsonb_build_object('id', 'reconsider_2', 'label', 'I would reconsider Decision 2')
     ),
     'missionControl', '[]'::jsonb
   )),

  (m, 1, 'judgement_reflection', 'response', 150,
   'Why?',
   NULL,
   jsonb_build_object(
     'prompt', 'What changed your mind — or what made you keep your earlier decision?',
     'inputType', 'long_text',
     'maxLength', 400,
     'required', true,
     'missionControl', '[]'::jsonb
   )),

  -- ================================================= 20. FINAL JUDGEMENT ====
  (m, 1, 'final_judgement', 'response', 160,
   'Final Judgement',
   'Use the physical Final Judgement card. These three prompts are the shape of it.',
   jsonb_build_object(
     'prompt', 'Write your final judgement here as well, so it stays in your Mission Trail.',
     'promptLines', jsonb_build_array('The evidence changed…', 'It could not undo…', 'What I stand by now is…'),
     'inputType', 'long_text',
     'maxLength', 400,
     'required', true,
     'instruction', 'Write one or two brief sentences in total.',
     'missionControl', '[]'::jsonb
   )),

  -- ======================================================= 21. COMPLETION ====
  (m, 1, 'complete', 'completion', 170,
   'Mission Complete',
   NULL,
   jsonb_build_object(
     'message', 'You made two decisions without the full story, followed what they changed, and looked again when the evidence arrived. That is the practice.',
     'trailSummary', 'Your Mission Board, tracker and Final Judgement card are yours to keep.',
     'trailEntries', jsonb_build_array(
       jsonb_build_object('type', 'physical', 'title', 'Six Names Mission Board', 'description', 'Six zones recording what you knew, what you chose and what followed.'),
       jsonb_build_object('type', 'physical', 'title', 'What''s Changing? tracker', 'description', 'Where you placed Spread, Support and Clarity as the case developed.'),
       jsonb_build_object('type', 'physical', 'title', 'Final Judgement card', 'description', 'Your written judgement, kept on paper.'),
       jsonb_build_object('type', 'digital', 'title', 'What I stand by now', 'fromResponse', 'final_judgement')
     )
   ));

  -- ============================================ completion rule (Tech §31) ==
  update missions set completion_rule = jsonb_build_object(
    'type', 'conditions',
    'conditions', jsonb_build_array(
      jsonb_build_object('kind', 'choice_exists',   'screenKey', 'decision1_move'),
      jsonb_build_object('kind', 'choice_exists',   'screenKey', 'decision2_move'),
      jsonb_build_object('kind', 'screen_visited',  'screenKey', 'later_evidence'),
      jsonb_build_object('kind', 'choice_exists',   'screenKey', 'judgement_card'),
      jsonb_build_object('kind', 'response_exists', 'screenKey', 'final_judgement')
    )
  )
  where id = m;
end $$;

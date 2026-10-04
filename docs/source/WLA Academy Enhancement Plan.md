<!-- Source: 'WLA ACADEMY — FEATURES & FUNCTIONALITY ENHANCEMENT PLAN.docx', received 2026-10-04.
     Text extracted verbatim from word/document.xml; headings marked up, content unchanged. -->

WLA ACADEMY — FEATURES & FUNCTIONALITY ENHANCEMENT PLAN

## Purpose

This document gives the WLA designer and developer the Academy capabilities to implement within the existing WLA structure.
The core Academy journey remains:
Purchase / Unlock → My Missions → Mission Home → Active Mission → Mission Complete → Mission Trail → My Missions. WLA ACADEMY ARCHITECTURE FINAL
Use the Six Names build as the implementation baseline. Generalise its proven patterns into reusable Academy capabilities and implement the additional functionality specified here. The existing Build Brief model already governs mission-specific screens, reveals, branches, responses, handoffs, state, Mission Control, completion and QA. WLA ACADEMY BUILD BRIEF — PRESE…
Two Academy-wide changes are included:
Child Access Code becomes an approved limited route into a child profile.
Mission Board moves from beneath Mission Home to My Missions, below the child’s mission collection.
All capabilities in this document are part of the current Academy build scope.

## 1. Family Account & Child Access

The parent or guardian continues to own the account. Each child profile continues to own that child’s missions, progress, responses and Mission Trail.
There is no additional Academy Home.

### What currently exists

The Academy already supports one parent/guardian account with multiple child profiles. Purchases, entitlements, child-profile management and permissions sit at account level. Mission status, mission state, saved responses and Mission Trail evidence belong to the child profile. WLA ACADEMY ARCHITECTURE FINAL
The Family Mission Guide already directs families through child profile → My Missions and is the recurring family guidance resource. WLA FAMILY MISSION GUIDE

### Action plan

Keep one parent/guardian account supporting multiple child profiles.
Keep mission entitlement, progress and Mission Trail evidence attached to the correct child.
Make the active child clear throughout the Academy.
Provide simple child-profile switching from the account area.
Keep purchases, entitlements, privacy permissions, account settings and support in the parent/account area.
Keep the Family Mission Guide on the account page.
Add a Child Access Code for each child profile.
Allow the parent to create, change or reset the code from child-profile/account controls.
Allow the child to use the code to enter their own Academy space directly.
Route successful Child Access Code entry to that child’s My Missions.
Limit child-code access to that child’s permitted Academy experience.
Preserve parent sign-in → select child → My Missions as the full account route.

### Designer

Keep account controls clearly separate from the child mission experience. Make child switching, Family Mission Guide access and Child Access Code management easy to find. Design child-code entry for independent use on phone and tablet.

### Developer

Maintain the parent-owned account / child-owned progress model. Implement secure profile-specific Child Access Codes with access limited to the associated child profile and permitted Academy destinations.

## 2. My Missions, Mission Home & Continuity

My Missions is the selected child’s Academy-level mission collection.
Mission Home is the permanent home for one mission.
Every mission continues to have one Mission Home. WLA ACADEMY ARCHITECTURE FINAL

### What currently exists

My Missions already shows missions belonging to the selected child, their status and the appropriate primary action.
Mission Home already contains:
Start / Continue Mission
Mission Kit
For Parents
Pause and return are already core Academy behaviour. WLA ACADEMY ARCHITECTURE FINAL

### Action plan

Keep My Missions specific to the active child.
Keep Not Started, In Progress and Complete as the core statuses.
Prioritise active missions and Continue actions.
Design My Missions to work with both small and large mission collections.
Use compact mission cards or an equivalent efficient layout as volume grows.
Add status filtering.
Add Lab filtering.
Add mission search.
Place Mission Board beneath the child’s mission collection on My Missions.
Keep Mission Home focused on the individual mission.
Keep Start / Continue Mission as the strongest Mission Home action.
Keep Mission Kit and For Parents clearly available but secondary.
Persist exact mission state across pause, exit and return.
Support continuation across compatible devices.
Save meaningful checkpoints automatically.
Restore established selections, branches, responses, reveals and mission state.
Support missions deliberately designed across multiple sessions.
Allow later sessions to resume from defined checkpoints.
Support stages designed to continue after a real-world interval where required.

### Designer

Design My Missions to remain clear with twenty or more missions. Keep Mission Board visually secondary to the child’s mission collection. Keep Mission Home focused on one mission.

### Developer

Persist mission state against the child profile rather than the browser session. Support cross-device continuation, defined checkpoints, multi-session state, search and filtering.

## 3. Mission Logic Engine

The Mission Logic Engine should control how missions react to what the child does.

### What currently exists

WLA already uses branching, reveals, consequences, persisted choices and mission state through Academy Build Briefs. Six Names provides the strongest current implementation reference. WLA ACADEMY BUILD BRIEF — PRESE…

### Action plan


### Branching and conditions

Support reusable branching.
Support branch convergence.
Support multiple approved outcomes.
Support conditional reveals.
Support conditional unlocks.
Support compound conditions based on more than one earlier state.
Keep unselected branch content inaccessible.
Allow later states to respond to earlier choices and responses.

### Mission variables

Support mission-specific variables.
Support visible variables.
Support hidden variables.
Support counters.
Support resource values.
Support changing mission state.
Persist variables where later behaviour depends on them.

### Prediction, consequence and revision

Support prediction → consequence.
Support decision → outcome.
Support original → revised.
Support before → after.
Support test → result → adjustment.
Support later consequences shaped by more than one earlier decision.

### Mission variants

Support approved, reproducible variants using combinations of:
clues;
evidence;
numbers;
resources;
constraints;
starting conditions;
scenario content;
approved age-band variants.
Record the variant used so pause/resume and later logic remain consistent.

### Changing-condition events

Support mission events that introduce an approved change in:
information;
resources;
rules;
constraints;
environment;
priorities;
available routes.
Examples include new evidence arriving, a route becoming unavailable, a resource being removed or a rule changing after the child has already acted.

### Controlled randomisation

Support random selection from approved content pools.
Allow weighting and exclusions where required.
Preserve generated results where later state depends on them.

### Time and staged progression

Support delayed reveals.
Support mission-specific timers where timing is part of the mechanic.
Support later-stage unlocks in multi-session missions.
Persist time-dependent state where required.

### Designer

Show changing states, branches and consequences clearly without exposing unnecessary system logic. Keep different routes visually coherent.

### Developer

Generalise the branching, persistence and reveal patterns proven through Six Names into configurable mission logic. Conditions, variables, variants, events and reveals should be driven through reusable systems rather than repeated hard-coding.

## 4. Interaction Component Library

The Academy should provide reusable interaction types so mission designers can choose the form that best carries the thinking.

### Action plan

Support:
single choice;
multiple selection;
short-text response;
numeric entry;
code entry;
word or phrase entry;
symbol/token sequence entry;
sorting;
sequencing;
reordering;
ranking;
matching;
drag-and-drop;
image hotspots;
annotation;
simple drawing/sketching;
sliders;
weighting;
resource allocation;
inventories;
maps;
route building;
node and connection building;
side-by-side comparison;
decision matrices;
pattern building;
simple simulation controls;
reset / retry / retest.
Each component should support relevant mission state, validation, persistence, Mission Trail status and conditional progression.

### Persistent interactive workspace

Individual components support discrete interactions. The persistent workspace supports arrangements that remain and change across mission states.
Use it for experiences such as:
evidence boards;
clue boards;
route-planning surfaces;
resource boards;
system maps;
priority boards;
relationship maps;
changing plans.
The workspace should:
hold approved mission objects;
remember placement and relationships;
accept new objects as the mission progresses;
allow earlier arrangements to be revised;
respond to mission state;
persist through pause/resume;
surface relevant state later in the mission.

### Designer

Create one coherent WLA interaction language. Keep controls touch-friendly and visually restrained. Design the persistent workspace as a thinking surface rather than a decorative canvas.

### Developer

Build reusable components with standard interfaces for state, persistence and validation. Integrate the persistent workspace with the same mission-state model.

## 5. Physical ↔ Digital Mission Mechanics

WLA should use technology for orchestration while preserving physical interaction where it strengthens the thinking and doing.
The Family Mission Guide already distinguishes physical work from Academy functions such as guidance, reveals, choices, progress and support. WLA FAMILY MISSION GUIDE

### Action plan


### QR and code mechanics

Support QR-enabled physical → Academy handoffs.
Make QR destinations mission-aware.
Make QR destinations state-aware where required.
Allow QR access to exact Mission Kit resources.
Support scan-to-reveal.
Support cipher → digital validation.
Support passphrase unlocks.
Support symbol/token sequence validation.
Support branch-specific codes.
Persist unlocked state.

### Physical result → digital response

Allow structured physical results to be entered into the Academy.
Validate those results where required by the mission.
Use successful validation to unlock approved content or progression.
Confirm completion without judging open-ended physical work.

### Digital reveal → physical action

Support screens that reveal:
a new card;
a changed instruction;
a new rule;
a resource;
a clue;
a physical change;
a new constraint.
Every handoff should tell the child where to go, what to do and when to return. WLA ACADEMY BUILD BRIEF — PRESE…

### Dynamic printable variants

Support generation of approved printable mission assets based on mission configuration or variant state.
Examples include:
different clue sets;
different values;
alternate routes;
different evidence combinations;
selected constraint cards;
mission-specific codes;
approved age-band variants.
Generated resources should retain approved WLA presentation and print standards.

### Device-assisted mission mechanics

Support device capability where it creates meaningful mission action.
Include:
camera-based scanning;
QR and marker recognition;
camera-based recognition of approved mission markers or objects where specified;
device orientation;
compass input;
motion input.
Camera-assisted mission mechanics must be object-facing only. They must not require or encourage the child’s face, body or identifying surroundings to appear.
Process camera-assisted mission interactions without retaining the captured image.
Provide an equivalent fallback route where camera use is unavailable, blocked or inappropriate.

### Designer

Treat physical and digital elements as one mission experience. Make all handoffs explicit and calm. Keep generated print materials visually consistent with fixed Mission Kit assets.

### Developer

Provide reusable scanning, QR, validation and device-input services linked to mission state. Handle permissions, compatibility, privacy and fallback behaviour as part of component implementation. Treat camera input as temporary mission input rather than stored child evidence. Build dynamic print generation from approved templates.

## 6. Mission Evidence & Mission Trail

Mission Trail remains the child’s private record of selected evidence arising from mission practice.
The current model already distinguishes physical evidence retained by the child from digital evidence genuinely stored by the Academy. WLA ACADEMY ARCHITECTURE FINAL

### Action plan

Keep Mission Trail selective.
Organise evidence by child.
Organise evidence by mission.
Record relevant date context.
Associate evidence with the Lab where useful.
Save Academy responses that genuinely show intended practice.
Identify physical work as Mission Trail evidence without requiring a digital copy.
Support relationships between evidence items.
Support original → revised.
Support plan → changed plan.
Support prediction → result.
Support first judgement → later judgement.
Surface meaningful before/after evidence where relevant.
Keep Mission Trail available after mission completion.
Allow eligible evidence to enter the Mission Board contribution flow.
The Family Mission Guide already describes Mission Trail as selected evidence of what the child has tried, changed, noticed and worked out. WLA FAMILY MISSION GUIDE

### Designer

Present Mission Trail as a private record of meaningful practice. Make physical-evidence references and Academy-stored evidence clearly distinguishable.

### Developer

Link evidence to the child, mission and relevant mission state. Support relationships between evidence items and references to physical evidence while keeping Trail content private by default.

## 7. Reflection & Thinking Mechanics

Reflection should arise from the mission and remain brief enough to preserve momentum.

### Action plan

Support reusable patterns for:
Predict.
Notice.
Explain.
Compare.
Reconsider.
What changed?
What stayed?
Claim + support.
Perspective switch.
Change one constraint.
Try again.
Revise.
Retain.
Final judgement.
Allow these patterns to:
reference earlier choices;
reference previous responses;
show earlier and current state together;
reopen a previous prediction after a consequence;
connect to selected Mission Trail evidence.

### Designer

Integrate thinking prompts into the mission rhythm. Keep them brief and varied enough that missions do not feel templated.

### Developer

Create reusable thinking patterns that can reference approved earlier state and stored responses.

## 8. Mission Control & Adaptive Support

Mission Control should continue to help the child move without solving the mission for them.
The current Build Brief standard already requires Mission Control to preserve exact state, redirect attention, provide the smallest useful next move and return the child to the mission. WLA ACADEMY BUILD BRIEF — PRESE…

### Action plan

Keep Mission Control state-aware.
Support multiple approved support levels.
Show the smallest useful nudge first.
Support “what should I check?” prompts.
Support redirection to relevant physical materials.
Support alternative wording of an instruction.
Support state-specific recovery.
Support interaction-recovery help where a technical state fails.
Support optional audio assistance.
Record Mission Control use for internal analytics.
Return the child to the exact state from which Mission Control opened.
Allow adaptive support to use only WLA-approved support content and permitted mission state.

### Designer

Keep Mission Control visually secondary and temporary.

### Developer

Bind support options to exact mission states and support levels. Preserve state on open and close.

## 9. Mission Board & Shared Practice

Mission Board is the optional Academy-wide space for selected, anonymised WLA practice.
Its approved placement is:
My Missions → child’s mission collection → Mission Board

### What currently exists

Mission Board is already defined as optional, anonymised and non-ranking. Sharing is not automatic. WLA FAMILY MISSION GUIDE

### Action plan

Place Mission Board beneath the mission collection on My Missions.
Keep it visually secondary to the child’s own missions.
Organise Board content by mission.
Organise Board content by Lab.
Allow eligible Mission Trail evidence to enter a contribution flow.
Include parent/guardian permission where required.
Apply anonymisation before publication.
Require WLA moderation before content appears.
Allow WLA to curate contrasting approaches.
Allow children to browse different ways a mission was approached.
Support filtering by mission.
Support filtering by Lab.
Provide a clear return to My Missions.

### Designer

Make Mission Board feel like a window into wider WLA practice rather than a social feed. Prioritise ideas and approaches rather than popularity.

### Developer

Build Mission Board as an Academy-wide destination linked from My Missions. Support permission state, anonymisation, moderation and mission/Lab tagging.

## 10. Media & Sensory Capability

Media should be available when it creates a better mission mechanic, reveal or explanation.

### Action plan

Support:
image reveals;
zoomable images;
before/after visual comparison;
layered visual evidence;
audio clues;
optional narration;
sound-based clues;
short animation;
WLA-supplied short video where motion carries essential information;
interactive diagrams;
layered maps;
media tied to conditional reveals;
media tied to mission variables;
media that changes by branch/state;
text equivalents for essential audio;
captions and transcripts where required.

### Designer

Use media where it changes what the child can notice, infer or do. Keep it restrained and consistent with the WLA visual system.

### Developer

Build reusable media blocks that can interact with mission state and logic. Optimise them for intended devices and realistic network conditions.

## 11. Accessibility & Flexible Participation

The mission should provide the challenge. The interface should make participation clear.
The Academy already requires clear actions, comfortable touch targets, readable content, no hover-dependent core interaction, no unnecessary precision input, no required horizontal scrolling and no colour-only state communication. WLA ACADEMY ARCHITECTURE FINAL

### Action plan

Build all core interactions for touch.
Support keyboard operation where relevant.
Support responsive text scaling.
Support reduced-motion preferences.
Use clear visible focus states.
Provide text equivalents for essential audio.
Provide captions/transcripts where required.
Use appropriately sized targets.
Preserve interaction state through accidental interruption.
Support alternative interaction routes where the same intended thinking can be preserved.
Build accessible behaviour into reusable components.
Include accessibility checks in mission QA.
Test phone portrait.
Test tablet portrait.
Test tablet landscape.
Test desktop where relevant.

### Designer

Design accessibility into default component states rather than creating separate accessible versions.

### Developer

Implement accessibility at shared-component level so future missions inherit it.

## 12. Mission Authoring & Production Tools

The Academy should make the growing capability set practical to configure, test and reuse.
These tools do not replace WLA’s governing documents.
The Mission Manual governs mission design. The Production Brief defines the approved mechanic. The Child Mission owns child-facing instructions. The Academy Build Brief owns mission-specific implementation. The Academy Architecture owns shared platform behaviour.
One idea. One authoritative home. Mission Manual(6)

### Action plan

Build:
reusable WLA mission templates;
interaction-component selection;
visual mission-flow mapping;
branch editor;
convergence mapping;
condition builder;
variable manager;
event/change-condition builder;
variant manager;
randomisation configuration;
reveal manager;
unlock manager;
physical-handoff block;
QR generator;
code/cipher configuration;
Mission Control authoring;
Mission Trail evidence markers;
physical-evidence markers;
multi-session checkpoint configuration;
timed-stage configuration;
media management;
dynamic-print configuration;
device-assisted mechanic configuration;
child-view preview;
phone preview;
tablet preview;
branch testing;
state inspector;
direct-state testing;
mission reset;
mission duplication;
approved variant duplication;
asset manager;
dependency checking;
print-resource checklist;
approved age-band and child-language checks;
accessibility checks;
version history;
Draft → Test → Publish workflow;
rollback;
mission metadata management.

### Mission Pattern Library

Build a reusable library of proven WLA mission structures.
Initial patterns should include:
Choose → consequence → reconsider
Predict → test → reveal → adjust
Clue → decode → unlock → investigate
Plan → changed condition → reroute
Build → test → change → retest
Observe → evidence → explanation → new evidence → revise
Allocate → event → rebalance
Original → challenge → revised
Patterns should combine approved components, logic states and handoffs while remaining editable for the individual mission.

### Automated mission QA

Build structural checks that flag:
branches with no valid destination;
unreachable states;
missing convergence where required;
reveals with no trigger;
unlocks with no valid condition;
required responses that can be bypassed;
inaccessible required content;
physical handoffs without a defined return;
later logic depending on state that is not persisted;
invalid QR/state relationships;
missing assets;
incomplete variant configuration;
missing device fallback;
incomplete completion routes;
paths that cannot reach Complete;
Mission Control states with no valid return;
conflicting mission dependencies.
Automated checks support, rather than replace, the existing Build Brief QA requirement to test every valid route and meaningful pause/resume state. WLA ACADEMY BUILD BRIEF — PRESE…

### Designer

Use the Six Names build and Build Brief structure as the implementation reference. Design authoring tools around WLA terminology and mission flow rather than generic lesson terminology.

### Developer

Generalise proven Six Names patterns into reusable configuration, components and tooling. Keep the Academy Build Brief as the mission-specific implementation authority.

## 13. Analytics That Improve Missions

Analytics should help WLA improve mission design, usability and technical reliability.

### Action plan

Track:
mission starts;
mission completion;
pause points;
resume points;
stage-level drop-off;
Mission Control use;
repeated Mission Control use at the same state;
interaction retries;
validation failures;
branch distribution;
variant distribution;
event-path distribution;
QR use;
physical/digital handoff use;
code/cipher attempts;
Mission Kit access during active missions;
Mission Trail saves;
multi-session return rates;
completion after return;
device category;
device-assisted fallback use;
mission version;
free mission → paid mission conversion;
repeat mission purchase.
Reporting should answer:
Where do children stop?
Where do they need repeated help?
Which branches and variants are actually used?
Which interactions or handoffs create friction?
Do mission revisions improve the experience?

### Designer

Keep internal analytics focused on actionable mission-design questions.

### Developer

Instrument shared components and mission-state transitions centrally. Associate events with mission, mission version and relevant state while applying WLA privacy and data-minimisation standards.

## Implementation Direction

Use the Six Names build as the implementation baseline.
Extend its proven patterns into reusable Academy systems and implement the additional capabilities in this document as part of the same current build.
The Academy should support future missions involving:
branching decisions;
consequences;
mysteries;
hidden information;
ciphers;
codes;
changing conditions;
route planning;
maps;
investigations;
simulations;
resource allocation;
physical builds;
testing;
evidence;
pattern discovery;
interactive workspaces;
dynamic printable materials;
multi-session challenges;
device-assisted action;
unexpected events;
revision;
reconsideration;
different valid routes through the same situation.
The child should continue to do the meaningful work.
The Academy should provide the orchestration, state, interaction, reveal, memory and support required to make that work possible.
The Mission Manual’s existing guardrail remains: digital delivery should support rather than replace meaningful action, while agency remains with the child. Mission Manual(6)

## Required Authority Updates


## Academy Architecture

Update the Academy Architecture to:
move Mission Board from beneath Mission Home to My Missions;
place Mission Board beneath the child’s mission collection as a secondary Academy-wide destination;
define the approved Mission Board permission, anonymisation and moderation model;
add Child Access Code as an approved limited child-profile access route;
place the Family Mission Guide on the account side of the Academy;
add My Missions status filtering, Lab filtering and search as current Academy capabilities;
retain parent/guardian ownership of the account and permissions;
retain My Missions as the child’s Academy-level mission collection;
retain one permanent Mission Home for each mission.
These updates replace previously deferred or differently placed Academy-wide decisions and should be made in the architecture authority rather than left only in implementation documentation. WLA ACADEMY ARCHITECTURE FINAL

## Family Mission Guide

Update the Family Mission Guide to:
explain Child Access Code as an optional direct child-access route;
retain the parent sign-in route;
state that the Family Mission Guide is available from the account page;
state that Mission Board is available from My Missions.
Generic recurring family guidance belongs in the Family Mission Guide. Mission Manual(6)

## Six Names

No redesign of Six Names is required.
Its approved mission structure and Build Brief remain authoritative for that mission. Use its implementation as the first proven reference for reusable Academy patterns.

## Appendix A — Build Scope & Workload Impact

All capabilities in this document are included in the current Academy build scope.
Much of the enhancement extends patterns already established through Six Names. Several additions introduce new reusable systems and therefore increase design, development and QA effort.

### Relative workload by addition

Addition
Extra workload
Why

### Mission variants

Low–Medium
Extends existing variables/branching

### Changing-condition events

Low–Medium
Mostly an extension of state + reveals
Multi-session missions
Medium
Requires robust persistence/checkpoints

### Persistent interactive workspace

High
New reusable interaction surface + state

### Dynamic printable variants

Medium–High
Generation logic, templates, print QA

### Mission Pattern Library

Low–Medium
Mostly production/tooling structure once components exist

### Automated mission QA

High
New internal validation/tooling
Device-assisted scanning/orientation/motion
Medium–High
Browser/device permissions, compatibility and fallback testing
Reference-platform appendix
None
Documentation only

### Overall workload

Earlier enhancement brief: approximately 6/10
Revised full-scope enhancement brief: approximately 8/10
The largest additional workload is likely to come from:
persistent interactive workspaces;
automated mission QA;
dynamic printable variants;
device-assisted mechanics;
the full reusable authoring capability.
Use work already established through Six Names wherever relevant rather than treating each capability as an unrelated new build.
These capabilities are current scope, not deferred future phases.

## Appendix B — Reference Platforms

Use these platforms as capability references only.
WLA’s Academy Architecture, Mission Manual, Build Briefs, child-experience standards, hybrid model, safeguarding requirements and design system remain authoritative.

### H5P

Reference for:
branching scenarios;
reusable interaction types;
configurable content blocks;
interactive scenario structures.

### Brilliant

Reference for:
direct manipulation;
learning through action;
interactive problem progression;
immediate visual response to the learner’s move.

### ThingLink

Reference for:
interactive images;
hotspots;
layered information;
visual exploration;
scenario-style interaction.

### Labster

Reference for:
simulation state;
structured checkpoints;
complex interactive environments;
pause and resume.

### Goosechase

Reference for:
staged mission progression;
unlockable activities;
real-world ↔ digital interaction;
mission-style challenges.

### Toddle

Reference for:
inquiry-oriented workflows;
evidence organisation;
family-facing learning context.

### Google Classroom

Reference for:
simple workflow;
clear continuation;
separation between resources and active work.

### Articulate Storyline / Rise

Reference for:
variables;
triggers;
layers;
state-driven interaction;
reusable interaction behaviour.
Final status: handover-ready.

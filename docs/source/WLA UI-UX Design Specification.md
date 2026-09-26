# WITHIN LAB ACADEMY

## UI/UX DESIGN SPECIFICATION

**Production Academy Design Specification**  
**Version:** 1.0  
**Status:** Production Design Direction  
**Product:** Within Lab Academy (WLA)

---

# 1. Purpose

This specification defines how the Within Lab Academy should look, behave and respond across the production Academy experience.

It translates the existing WLA visual language, current public website prototype, Academy Architecture and Designer Brief into a practical UI/UX system that can be implemented consistently in Figma and subsequently in the production application.

The goal is **not to redesign WLA from scratch**.

The goal is to:

- carry the established WLA visual character into the Academy;
- create a clear and usable learner environment;
- establish reusable components rather than isolated screens;
- support multiple missions without redesigning the interface for every mission;
- distinguish the public website from the functional Academy;
- make the Academy calm, readable and easy to use;
- provide enough detail that development does not require visual or interaction guesswork.

The production design should therefore feel like **the same WLA, entering a more focused environment**.

---

# 2. Design Authority

The following hierarchy governs design decisions.

### 1. WLA Public Website Master

Controls:

- public page structure;
- public copy;
- public navigation;
- CTA logic;
- mission presentation;
- Journal;
- FAQ;
- public route roles.

### 2. WLA Academy Architecture

Controls:

- My Missions;
- child profiles;
- Mission Home;
- Mission Kit;
- For Parents;
- Active Mission;
- Mission Control;
- pause/resume;
- completion;
- Mission Trail;
- Mission Board;
- shared mission status;
- Academy navigation.

### 3. Individual Mission Build Brief

Controls:

- individual mission screens;
- screen sequence;
- branching;
- reveals;
- responses;
- physical/digital handoffs;
- Mission Control content;
- completion logic.

### 4. Child Mission / Presentation Standards

Controls:

- physical mission materials;
- child-facing mission artefacts;
- mission-specific presentation requirements.

### 5. This UI/UX Specification

Controls:

- visual hierarchy;
- layout;
- spacing;
- typography;
- colour application;
- components;
- responsive behaviour;
- interaction states;
- accessibility;
- interaction patterns;
- design handoff.

Where authorities conflict, the conflict should be surfaced rather than silently resolved through visual design.

---

# 3. Existing Public Website: Visual Reference

The current Home, Labs and Missions designs establish the visual foundation that the Academy should inherit.

The existing design demonstrates:

- warm cream backgrounds;
- deep olive interaction colour;
- restrained sage surfaces;
- charcoal/brown typography;
- editorial serif headings;
- humanist sans-serif interface/body text;
- generous whitespace;
- thin and subtle borders;
- restrained rounded corners;
- tactile object-led imagery;
- quiet section transitions;
- minimal shadows;
- calm editorial composition;
- simple navigation;
- restrained CTAs.

The Designer Brief specifically identifies these characteristics as the qualities to carry forward: warm cream, restrained colour, editorial hierarchy, visual breathing room, tactile materiality, deliberate section rhythm and selective imagery.

The production pass should **refine rather than reinvent** this language.

---

# 4. Core Design Character

WLA should feel:

- warm;
- tactile;
- thoughtful;
- capable;
- structured;
- calm;
- quietly adventurous.

The useful mental model is:

> **A beautifully organised field desk before an expedition.**

This is a mood reference, not a literal visual theme.

The Academy should NOT become:

- a toy interface;
- a brightly coloured children's learning platform;
- a gamified dashboard;
- a conventional LMS;
- a generic SaaS dashboard;
- an educational marketplace;
- an overly rustic "adventure" website.

The child's energy should come from the **mission itself**, not from decorative UI.

The interface provides the structure.

The mission provides the intrigue.

---

# 5. Product Experience Layers

WLA should operate as three related but increasingly focused experiences.

## Layer 1 — Public Website

### Discover → Understand → Choose → Purchase

This is the most editorial layer.

It can use:

- larger imagery;
- richer compositions;
- stronger storytelling;
- more expressive section layouts.

---

## Layer 2 — My Missions

### Access → Open → Return

This is the functional bridge between the public website and Academy.

It should feel:

- simpler;
- clearer;
- more organised;
- less editorial.

The user should immediately understand:

> "These are the missions this child has access to."

---

## Layer 3 — Active Mission

### Do → Notice → Complete → Keep growing

This is the quietest environment.

The interface should reduce visual competition and give the mission content the greatest amount of attention.

This distinction is explicitly required by the Designer Brief.

---

# 6. Visual Design System

## 6.1 Colour

The established WLA production palette should be the foundation.

| Token          | Colour    | Primary Use                          |
| -------------- | --------- | ------------------------------------ |
| Warm Cream     | `#F5EFE3` | Main canvas                          |
| Charcoal Brown | `#3A2F2A` | Headings, body text, navigation      |
| Deep Olive     | `#5F6A4F` | Primary CTA, active states, emphasis |
| Soft Sage      | `#A3B18A` | Supporting surfaces                  |
| Clay           | `#B87C5A` | Small accents and markers            |

These colours are specified in the Designer Brief.

### Usage rule

**Cream carries the system.**

Olive is used deliberately.

Sage creates occasional surface variation.

Clay should remain an accent rather than becoming a second brand colour.

Do not give Challenge, Decision, Curiosity, Wellbeing and Navigation Labs completely different colour identities.

They should remain recognisably part of one WLA system.

---

# 7. Academy Colour Application

The Academy should use less colour than the public website.

### Public Website

More visual variation:

Cream → Sage → Cream → image → Cream

### My Missions

Primarily:

Cream + Charcoal + Olive

with occasional Sage surfaces.

### Active Mission

Primarily:

Cream + Charcoal

with Olive reserved for:

- primary actions;
- active controls;
- important emphasis.

This reduction in colour should help create the feeling of entering a focused working environment.

---

# 8. Typography

The existing WLA typographic direction should remain.

Use no more than two principal families:

### Display / Editorial Serif

Used for:

- page headings;
- mission titles;
- section headings;
- important editorial statements.

### Humanist Sans

Used for:

- navigation;
- body text;
- buttons;
- labels;
- metadata;
- instructional content;
- forms;
- system messages.

The Designer Brief defines the desired relationship as:

> editorial warmth + practical clarity.

Do not introduce:

- novelty fonts;
- childish display fonts;
- handwriting fonts;
- decorative instructional typography.

### Recommended hierarchy

| Level      | Use                             |
| ---------- | ------------------------------- |
| Display    | Major Academy/page heading      |
| H1         | Primary page title              |
| H2         | Major section                   |
| H3         | Component/mission section       |
| Body Large | Introductory copy               |
| Body       | Normal content                  |
| Small      | Metadata/supporting information |
| Label      | Buttons, status, navigation     |

Exact typeface names should be locked against the existing public prototype rather than introducing a new pairing.

---

# 9. Typography Behaviour

Headings should have:

- relatively tight line-height;
- generous separation from supporting text;
- comfortable line lengths;
- strong contrast against the background.

Body copy should have:

- relaxed line-height;
- comfortable reading width;
- sufficient contrast;
- no unnecessarily small text.

Supporting text in the existing prototype should not become so light that it compromises readability.

The solution should normally involve a combination of:

- text colour;
- weight;
- size;
- line-height;
- background treatment.

Do not solve every readability issue by darkening entire sections.

---

# 10. Layout System

The WLA layout should feel spacious without becoming empty.

Use a consistent maximum content width.

### Recommended production structure

**Desktop**

- max content width: approximately 1200–1280px;
- generous horizontal margins;
- 12-column conceptual grid;
- consistent section gutters.

**Tablet**

- reduced horizontal padding;
- 8-column conceptual grid where useful.

**Mobile**

- single-column layout;
- approximately 20–24px horizontal page padding;
- no unnecessary edge-to-edge text.

Exact values should be finalised in the design file and converted into design tokens.

---

# 11. Spacing System

Use a consistent spacing scale rather than arbitrary values.

Recommended base unit:

**4px**

Suggested tokens:

| Token   |  Value |
| ------- | -----: |
| XS      |    4px |
| S       |    8px |
| SM      |   12px |
| M       |   16px |
| L       |   24px |
| XL      |   32px |
| 2XL     |   48px |
| 3XL     |   64px |
| 4XL     |   80px |
| 5XL     |   96px |
| Section | 120px+ |

Not every screen should use the largest values.

The principle is:

> **Use space to establish hierarchy, not simply to make screens look spacious.**

---

# 12. Shape Language

Use moderately softened corners.

Recommended production starting point:

- buttons: 999px where pill treatment is already established;
- cards: 6–10px;
- inputs: 6–8px;
- panels: 8–12px;
- modal/dialog: 10–12px.

Avoid:

- excessive pill interfaces;
- large bubbly cards;
- floating dashboard panels;
- heavy shadows.

The Designer Brief specifically recommends physical-material shadows rather than software-like floating surfaces.

---

# 13. Borders and Shadows

### Borders

Use subtle borders to:

- separate cards;
- define controls;
- establish hierarchy;
- distinguish surfaces.

Borders should generally be low contrast.

### Shadows

Use very lightly.

The visual reference is:

> paper slightly lifted from a surface.

Not:

> software floating above the page.

Most Academy surfaces should not need a shadow.

---

# 14. Imagery

WLA imagery is:

- object-led;
- naturally lit;
- warm;
- tactile;
- quiet;
- process-oriented.

Avoid generic images of:

- children smiling at cameras;
- classroom stock photography;
- generic laptops;
- generic education scenes.

The child should be represented through:

- things they built;
- things they changed;
- things they marked;
- things they tested;
- things they decided;
- evidence of practice.

This is a key part of the WLA visual identity.

---

# 15. Public Website Continuity

The attached screenshots establish several reusable patterns.

### Navigation

Simple horizontal navigation.

### CTA

Compact olive CTA with restrained shape.

### Section transitions

Large blocks of cream and sage rather than excessive cards.

### Cards

Used when they represent meaningful objects or choices.

### Images

Large, tactile and object-led.

### Typography

Editorial heading + practical supporting copy.

### Content density

Low to moderate.

The Academy should inherit these patterns but simplify them where task completion requires greater clarity.

---

# 16. Academy Information Architecture

The shared Academy journey is:

**My Missions**  
↓  
**Mission Home**  
↓  
**Active Mission**  
↓  
**Mission Complete**  
↓  
**Mission Trail**  
↓  
**My Missions**

The Academy Architecture defines these areas as locked.

---

# 17. Academy Navigation

The Academy should not replicate the full public navigation inside every mission screen.

The learner should have access to a lightweight Academy shell.

Recommended structure:

### Academy Header

Left:

**Within Lab Academy logo**

Centre/right:

- My Missions
- current child/profile control where appropriate

Optional:

- More / account access

The header should become visually quieter once the learner enters Active Mission.

---

# 18. Child Profile Selection

If an account contains multiple children, the active child must be obvious before mission access.

### Design requirements

Provide:

- profile selection;
- active profile indication;
- profile switching;
- associated My Missions state.

The experience should feel family-oriented rather than like social-profile management.

Do not overemphasise the child's profile image or identity.

The important information is:

> **Which child's missions am I looking at?**

---

# 19. Child Profile Selector

Recommended presentation:

### Single child

A compact profile indicator may appear in the Academy header.

### Multiple children

Use a clear selector.

Example:

**Abdullah's Missions**  
`⌄`

or:

**For Amina**  
`Change`

Opening it reveals available child profiles.

The selector should not dominate the screen.

---

# 20. My Missions

## Purpose

My Missions is the learner's collection and status layer.

It answers:

> What missions do I have?  
> What was I doing?  
> Where do I continue?

The Architecture defines My Missions as the collection/status layer rather than a generic dashboard.

---

# 21. My Missions Layout

Recommended structure:

### Header

**My Missions**

Supporting text:

A short explanation of the page.

### Active profile

Clear indication of the selected child.

### Mission collection

Mission cards/list.

Each mission should show:

- mission image;
- title;
- Lab;
- age range;
- approximate duration;
- delivery type where relevant;
- status;
- primary action.

---

# 22. Mission Card States

## Not Started

Status:

**Not Started**

Primary action:

**Open Mission**

---

## In Progress

Status:

**In Progress**

Primary action:

**Continue**

Optional supporting information:

`Last explored: ...`

Avoid adding unnecessary progress percentages unless the mission actually provides meaningful progress data.

---

## Complete

Status:

**Complete**

Primary action:

**View Mission**

Completed missions remain visible.

They should not look disabled or archived.

---

# 23. Status Design

Status must never depend on colour alone.

Use:

- text;
- icon where useful;
- layout;
- action wording.

Example:

**IN PROGRESS**

rather than only an olive indicator.

This requirement is explicitly defined in the Architecture and Designer Brief.

---

# 24. Mission Home

Mission Home is the permanent home of an individual mission.

It exists:

- before the mission;
- during the mission;
- after completion.

Its primary purpose is to bridge:

**owning a mission → doing the mission**

---

# 25. Mission Home Hierarchy

The hierarchy should be:

### 1. Mission identity

- Mission title
- Lab
- short description
- relevant metadata

### 2. Primary action

**Start Mission**

or

**Continue Mission**

### 3. Supporting areas

**Mission Kit**

**For Parents**

These must remain accessible but clearly secondary.

This hierarchy is locked by the Academy Architecture.

---

# 26. Mission Home — Not Started

Recommended composition:

Large mission identity area.

Example:

**Mars Bridge Builder**

Challenge Lab

Build. Test. Improve.

Short description.

**[ Start Mission → ]**

Below:

**Mission Kit**

Materials you'll need for this mission.

**For Parents**

A short note about helping your child get started.

---

# 27. Mission Home — In Progress

The primary action changes to:

**Continue Mission →**

The screen should make it obvious that the child can return to exactly where they stopped.

Secondary actions remain:

- Mission Kit;
- For Parents.

---

# 28. Mission Home — Complete

The mission should show:

**Complete**

Primary action:

**View Mission**

The mission must not automatically restart.

Mission Kit remains available.

For Parents remains available.

Relevant Mission Trail evidence may also be surfaced.

The Architecture explicitly states that completed missions remain accessible rather than being automatically restarted.

---

# 29. Mission Kit

Mission Kit is the permanent home for WLA-supplied resources.

Possible resources include:

- Child Mission;
- Town Map;
- cards;
- trackers;
- printables;
- other physical mission resources.

The exact resources vary by mission.

---

# 30. Mission Kit UI

Resources should be presented as intentional mission materials rather than generic downloads.

Each resource may include:

- preview/thumbnail;
- title;
- short description;
- resource type;
- action.

Possible actions:

**View**

**Print**

**Download**

Only show actions that actually apply.

---

# 31. Mission Kit Rules

Opening a resource does NOT change mission progress.

Downloading a resource does NOT change mission progress.

Printing a resource does NOT change mission progress.

Mission Kit remains available:

- before starting;
- during the mission;
- after completion.

---

# 32. For Parents

For Parents is separate from Mission Kit.

Its primary content is:

**Mission Note for Parents**

The experience should feel adult-facing without becoming a separate parent dashboard.

It should explain what the parent needs to know to enable the mission.

It should remain:

- easy to find;
- calm;
- concise;
- secondary to the child's main action.

The Parent Note remains accessible throughout the mission lifecycle.

---

# 33. Active Mission

Active Mission is the most important Academy interface.

It is where the child actually does the mission.

Therefore:

> **The interface should get out of the way.**

The Designer Brief describes Active Mission as the quietest part of the system.

---

# 34. Active Mission Visual Direction

Compared with the public website:

### Reduce

- decorative imagery;
- large promotional sections;
- unnecessary cards;
- visual variety;
- navigation options;
- animation.

### Increase

- reading clarity;
- instruction hierarchy;
- whitespace;
- touch target size;
- obvious next action;
- task focus.

---

# 35. Active Mission Shell

The shared shell should provide:

### Header

- WLA logo;
- mission title or compact mission identity;
- Mission Home;
- Mission Kit;
- Mission Control where applicable.

### Main content

Mission-specific screen.

### Primary action area

Clear next action.

The exact screen content is determined by the individual Mission Build Brief.

---

# 36. Mission Screen Structure

A reusable mission screen should generally have:

### Context

Where am I?

### Instruction

What should I do?

### Interaction

What do I need to provide/select/do?

### Response

What happens after I act?

### Next action

What happens now?

Not every mission screen needs all five.

The system must remain flexible.

---

# 37. Preparation State

Where physical resources are required, the Active Mission may begin with a preparation state.

It should answer:

**What do I need now?**

**Do I need to print anything?**

**Where do I find it?**

Then:

**I'm ready →**

Preparation should orient rather than duplicate the Child Mission.

---

# 38. Physical Handoffs

Hybrid missions require especially clear transition states.

Every Academy-to-physical transition should answer:

### Where do I go?

### What do I do?

### When do I come back?

Example:

**Time to build.**

Take the bridge materials from your Mission Kit.

Build your first bridge.

When you're ready to test it, come back here.

**[ I'm ready → ]**

The Academy orchestrates the activity.

It does not unnecessarily reproduce the physical activity digitally.

This follows the Architecture principle:

> Use technology for orchestration. Preserve physical interaction for thinking, doing and evidence.

---

# 39. Mission Control

Mission Control is optional support.

It should feel:

- calm;
- available;
- secondary;
- supportive;
- non-disruptive.

It must not feel like:

- the answer;
- a reward;
- a rescue button;
- a hint ladder.

The Designer Brief explicitly establishes this distinction.

---

# 40. Mission Control Interaction

When opened:

- mission position remains unchanged;
- current screen remains visible underneath where appropriate;
- support is presented in a focused panel/sheet;
- closing returns the child to exactly where they were.

Mission Control must not advance mission progress.

---

# 41. Pause and Resume

Leaving an Active Mission must not destroy progress.

The system should preserve:

- current screen;
- completed digital actions;
- branches;
- reveals;
- saved responses;
- relevant mission state.

Returning through:

**Continue Mission**

should take the child back to the appropriate point.

---

# 42. Mission Complete

Completion should be restrained.

Do not use:

- confetti;
- excessive animation;
- reward explosions;
- gamified celebration;
- badges unless separately approved.

Instead:

### Mission Complete

Acknowledge the completed work.

Show meaningful next options:

**View Mission Trail**

**Return to Mission Home**

**Back to My Missions**

Completion should feel like:

> "You finished something."

Not:

> "You won a game."

---

# 43. Mission Trail

Mission Trail is the child's private record of selected evidence.

It is not:

- a social profile;
- a public portfolio;
- a leaderboard;
- a general file repository.

It should feel reflective and personal.

---

# 44. Mission Trail Content

Evidence may include:

- selected digital responses;
- stored digital artefacts;
- evidence descriptions;
- physical evidence references.

Where evidence is physical, the Academy must not imply that WLA digitally stores something it does not actually store.

---

# 45. Mission Trail Layout

Recommended:

### Header

**Mission Trail**

Mission title.

### Evidence collection

Each evidence item may include:

- title;
- image/preview where digitally stored;
- short description;
- date/context where meaningful.

The layout should resemble a **quiet record of practice**, not a social feed.

---

# 46. Mission Board

Mission Board is a secondary Academy destination.

It should remain beneath the main mission journey.

It must not interrupt:

**My Missions → Mission Home → Active Mission**

The Architecture explicitly positions Mission Board beneath Mission Home.

For the MVP, do not design detailed contribution/moderation mechanics unless specifically approved.

---

# 47. Component System

The Academy should be built from reusable components.

Core components should include:

### Navigation

- Academy Header
- Mobile Navigation
- Profile Switcher

### Mission

- Mission Card
- Mission Metadata
- Mission Status
- Mission Action
- Mission Home Header
- Mission Progress State

### Resources

- Mission Kit Resource
- Resource Preview
- Resource Action

### Parent

- Parent Note Entry
- Parent Note Panel

### Active Mission

- Mission Screen Shell
- Instruction Block
- Response Component
- Primary Action
- Physical Handoff
- Preparation State
- Mission Control
- Exit/Return control

### Completion

- Completion State
- Mission Trail Entry
- Evidence Item

### System

- Loading
- Empty
- Error
- Unavailable
- Confirmation
- Modal
- Toast where genuinely necessary

---

# 48. Button System

The public prototype uses restrained buttons.

Carry this into the Academy.

### Primary

Deep Olive background.

Cream/light text.

Used for:

- Start Mission;
- Continue Mission;
- major confirmation actions.

### Secondary

Transparent or cream surface.

Charcoal text.

Subtle border.

Used for:

- Mission Kit;
- View;
- secondary navigation.

### Text Action

Used sparingly for low-emphasis navigation.

Example:

**View Mission →**

Avoid creating five visually equal buttons on one screen.

---

# 49. Button Behaviour

Buttons should have:

### Default

Normal state.

### Hover

Subtle colour/surface change.

### Focus

Clearly visible focus ring.

### Pressed

Small visual confirmation.

### Disabled

Reduced emphasis while retaining readable text.

### Loading

Preserve button dimensions.

Example:

`Starting mission…`

Do not allow layout jumping.

---

# 50. Cards

Cards should only be used where they create useful grouping.

Good uses:

- mission cards;
- resource items;
- evidence items;
- profile selection.

Avoid turning every section into a card.

A section of plain content on the cream canvas is often more consistent with WLA.

---

# 51. Forms and Inputs

Inputs should use:

- cream/light surfaces;
- subtle borders;
- charcoal text;
- clear labels;
- generous vertical spacing;
- visible focus state.

Never rely on placeholder text as the only label.

Validation should be calm and close to the relevant field.

---

# 52. Modal / Sheet Behaviour

Use modal/sheet interfaces for:

- profile switching;
- Mission Control;
- confirmation;
- focused resource preview where appropriate.

Do not use modals for ordinary navigation.

On mobile, sheets may be preferable where they preserve context.

---

# 53. Loading States

Loading should feel quiet.

Avoid elaborate loaders.

Recommended:

- simple skeleton;
- subtle loading indicator;
- reserved content space.

Avoid:

- full-screen animations;
- branded loading sequences;
- unnecessary motion.

---

# 54. Empty States

Empty states should explain what happened and what the user can do next.

Example:

**No missions yet.**

When a mission becomes available, you'll find it here.

Primary action where relevant:

**Explore Missions →**

Do not make empty states look like errors.

---

# 55. Error States

Error messages should:

1. explain the problem simply;
2. preserve context;
3. provide an action where possible.

Example:

**We couldn't load this mission.**

Please try again.

**[ Try Again ]**

Avoid technical error messages such as:

`Error 500: failed to fetch mission_state`.

---

# 56. Unavailable States

If a mission/resource is temporarily unavailable:

- explain that it is unavailable;
- do not imply the child's progress is lost;
- provide an alternative route where possible.

Example:

**This resource isn't available right now.**

Your mission progress is safe.

**[ Try Again ]**

---

# 57. Responsive Design

Responsive design is not simply desktop stacked vertically.

The Academy must intentionally support:

- smartphone portrait;
- tablet portrait;
- tablet landscape;
- desktop.

The Architecture specifically states that core behaviour should not depend on desktop use.

---

# 58. Mobile

Mobile should prioritise:

- one clear task;
- one primary action;
- readable instructions;
- comfortable touch targets;
- minimal navigation.

Mission screens should generally be single-column.

Avoid:

- dense two-column layouts;
- tiny controls;
- horizontal scrolling;
- hover-dependent interactions.

---

# 59. Tablet

Tablet should provide more breathing room.

Where appropriate:

- two-column Mission Home;
- wider Mission Kit resource layout;
- larger mission imagery;
- more spacious Active Mission content.

However, tablet should never force a desktop-like experience.

---

# 60. Desktop

Desktop may provide:

- wider mission imagery;
- stronger editorial composition;
- two-column layouts;
- larger content widths.

But Active Mission should remain focused rather than expanding content merely because more screen space exists.

---

# 61. Responsive Transformation Rules

The design system should explicitly document:

### Desktop → Mobile

- navigation collapses;
- multi-column layouts become single-column;
- images may move above content;
- secondary content moves below primary action;
- card grids become vertical lists;
- Mission Home hierarchy remains unchanged.

### Desktop → Tablet

- reduce gutters;
- maintain readable measure;
- preserve major two-column relationships where useful.

### Active Mission

Do not introduce unnecessary layout changes that alter the learner's understanding of the task.

---

# 62. Accessibility

Accessibility must be designed into the system rather than checked only at the end.

Required:

- sufficient contrast;
- visible focus;
- keyboard access;
- comfortable touch targets;
- readable text;
- meaningful reading order;
- text enlargement;
- reduced-motion support;
- state communication beyond colour;
- no hover-only essential information.

These requirements are explicitly included in the Designer Brief and Academy Architecture.

---

# 63. Touch Targets

Interactive controls should have comfortable touch areas.

Avoid:

- tiny text links;
- tiny icons;
- tightly packed controls;
- precision drag interactions unless the mission specifically requires them.

---

# 64. Focus States

Every interactive component needs a visible focus state.

This applies to:

- buttons;
- links;
- inputs;
- selectors;
- cards acting as links;
- Mission Control;
- navigation.

Focus should be visible without disrupting the visual character.

---

# 65. Motion

Motion should communicate:

- state;
- transition;
- location;
- feedback.

Avoid:

- confetti;
- bouncing elements;
- excessive scaling;
- game-like reward animation;
- spinning loaders where unnecessary;
- auto-advancing content;
- heavy parallax.

The WLA experience should feel calm even when something changes.

---

# 66. Interaction Principles

### Principle 1

**The next action should be obvious.**

### Principle 2

**The child should always understand where they are.**

### Principle 3

**Leaving should not destroy progress.**

### Principle 4

**Support should not interrupt the task.**

### Principle 5

**Physical activity should remain physical where intended.**

### Principle 6

**The interface should not compete with the mission.**

### Principle 7

**One idea should have one authoritative home.**

---

# 67. Academy Screen Inventory

The production design should include at minimum:

## Account / Profile

1. Login
2. Sign up
3. Account recovery
4. Child profile selection
5. Child profile switching

## My Missions

6. My Missions — populated
7. My Missions — empty
8. My Missions — loading
9. My Missions — error/unavailable

## Mission Home

10. Mission Home — Not Started
11. Mission Home — In Progress
12. Mission Home — Complete

## Mission Kit

13. Mission Kit — populated
14. Mission Kit — empty
15. Resource preview
16. Resource unavailable

## For Parents

17. Parent Note

## Active Mission

18. Preparation
19. Generic mission screen shell
20. Response state
21. Physical handoff
22. Mission Control closed
23. Mission Control open
24. Interrupted/resume state

## Completion

25. Mission Complete
26. Mission Trail — populated
27. Mission Trail — empty where applicable

## Secondary

28. Mission Board shell where required

## System

29. Loading
30. Empty
31. Error
32. Unavailable
33. Confirmation
34. Focus/keyboard states

---

# 68. Public-to-Academy Transition

The transition from the public website into the Academy should feel intentional.

Example:

Public:

**Try a Free Mission →**

↓

Account/authentication

↓

Child/profile selection if required

↓

**My Missions**

↓

Mission Home

↓

**Start Mission**

The interface should become progressively quieter at each step.

---

# 69. Mission Catalogue → Academy

A public Mission page answers:

> "Do I want this mission?"

The Academy answers:

> "I own/access this mission. What do I do now?"

Therefore, do not simply reuse the public Mission Detail page as Mission Home.

Public Mission Detail may include:

- marketing imagery;
- pricing;
- Leaves Behind;
- purchase CTA.

Mission Home should instead prioritise:

- mission identity;
- Start/Continue;
- Mission Kit;
- For Parents.

---

# 70. Mission Card Design Relationship

The attached Missions screenshot establishes the current public Mission Card pattern.

That pattern should remain recognisable.

However, the Academy Mission Card should be more functional.

### Public card

Mission discovery.

### Academy card

Mission access/status.

The Academy card should therefore place greater emphasis on:

**Status + action**

rather than:

**marketing description + discovery.**

---

# 71. Design Tokens

The final design file should document:

### Colour

- background;
- surface;
- text;
- muted text;
- border;
- primary;
- focus;
- success;
- error;
- warning.

### Typography

- font families;
- sizes;
- weights;
- line heights;
- letter spacing.

### Spacing

4px-based scale.

### Radius

Shared radius tokens.

### Shadow

Minimal elevation tokens.

### Breakpoints

Documented responsive breakpoints.

### Motion

Duration and easing tokens.

---

# 72. Component Variants

Each reusable component should include its required states.

For example:

### Mission Card

- default;
- hover;
- focus;
- not started;
- in progress;
- complete;
- unavailable.

### Button

- primary;
- secondary;
- text;
- hover;
- pressed;
- focus;
- disabled;
- loading.

### Resource

- available;
- viewed;
- downloadable;
- printable;
- unavailable.

### Mission Control

- closed;
- open;
- loading;
- unavailable.

---

# 73. Figma Organisation

Recommended Figma structure:

## 00 — Cover / Documentation

- project overview;
- design principles;
- authority hierarchy.

## 01 — Foundations

- colours;
- typography;
- spacing;
- grid;
- radius;
- shadows;
- icons.

## 02 — Components

- buttons;
- navigation;
- cards;
- forms;
- status;
- modals;
- resource components.

## 03 — Academy Shell

- desktop;
- tablet;
- mobile.

## 04 — My Missions

## 05 — Mission Home

## 06 — Mission Kit

## 07 — For Parents

## 08 — Active Mission

## 09 — Mission Control

## 10 — Mission Complete

## 11 — Mission Trail

## 12 — States

## 13 — Responsive

## 14 — First Mission

---

# 74. Developer Handoff

The developer should not have to infer:

- spacing;
- hierarchy;
- component behaviour;
- responsive behaviour;
- state behaviour;
- focus states;
- loading;
- errors;
- empty states;
- transition behaviour.

The Designer Brief explicitly requires these to be supplied during handoff.

Each important screen should therefore include:

### Screen purpose

What is this screen for?

### Entry condition

How did the user get here?

### Primary action

What is the most important action?

### Secondary actions

What else can the user do?

### State

Not started / in progress / complete / etc.

### Responsive behaviour

What changes on mobile/tablet?

### Interaction

What happens after each action?

### Data dependency

What information must exist for this screen?

---

# 75. Design-to-Development Rule

The Academy should not be designed as a collection of custom pages.

Instead:

> **Design the shared system first, then let missions use that system.**

This means a new mission should primarily require:

- mission content;
- mission imagery;
- mission-specific screens;
- mission-specific interactions;
- mission-specific physical handoffs.

It should NOT require rebuilding the Academy UI.

---

# 76. What Should NOT Be Added

The design should not introduce:

- points;
- badges;
- streaks;
- rankings;
- leaderboards;
- social profiles;
- chat;
- unnecessary notifications;
- mission replay;
- My Missions search/filter;
- public Mission Trail sharing;
- compulsory evidence upload;
- complex Mission Board mechanics.

These are outside the current approved scope or explicitly deferred.

---

# 77. Design Quality Bar

A screen should pass the following questions.

### Clarity

Can the user understand where they are?

### Hierarchy

Is the most important thing visually dominant?

### Action

Is the next action obvious?

### Calm

Is anything competing unnecessarily for attention?

### Consistency

Does it belong to WLA?

### Flexibility

Can the component work with future missions?

### Responsiveness

Does it work intentionally across phone, tablet and desktop?

### Accessibility

Can it be used without relying on colour, hover or precise interaction?

### Production

Can a developer build it without making important design assumptions?

---

# 78. Academy Experience Test

The complete experience should feel like this:

**I select my child.**

↓

**I see the missions they can access.**

↓

**I open one mission.**

↓

**I understand what it is and what I need.**

↓

**I start.**

↓

**The interface guides me without getting in the way.**

↓

**I can leave and return without losing my place.**

↓

**I can access resources when needed.**

↓

**I can get parent guidance when needed.**

↓

**I complete the mission.**

↓

**I can see what I have left behind.**

↓

**I return to My Missions.**

That is the core Academy experience.

---

# 79. Final Design Principle

The production Academy should follow one central rule:

> **The interface should organise the experience, not become the experience.**

The public website can be expressive.

My Missions can be functional.

Active Mission should be quiet.

The mission itself should provide the intrigue, physicality, experimentation and sense of discovery.

The final system should therefore feel unmistakably **Within Lab**, while becoming increasingly focused as the child moves from discovery into practice.

---

# 80. Final Design Acceptance Checklist

Before development handoff:

## Visual

- [ ] Warm Cream is the dominant canvas.
- [ ] Deep Olive is used deliberately.
- [ ] Sage remains a supporting surface.
- [ ] Clay remains an accent.
- [ ] Typography maintains the established serif + sans relationship.
- [ ] Imagery remains tactile and object-led.
- [ ] Shadows remain restrained.
- [ ] Cards are used intentionally.
- [ ] Public and Academy experiences feel related but distinct.

## Academy

- [ ] Child profile is clear.
- [ ] My Missions is immediately understandable.
- [ ] Mission status is not communicated by colour alone.
- [ ] Mission Home prioritises Start/Continue.
- [ ] Mission Kit is clearly distinct from Mission Trail.
- [ ] For Parents is easy to find but subordinate.
- [ ] Active Mission is quieter than the public website.
- [ ] Mission Control feels optional.
- [ ] Physical handoffs are clear.
- [ ] Pause/resume behaviour is reflected in the UI.
- [ ] Completion is restrained.
- [ ] Mission Trail feels private.
- [ ] Mission Board does not feel like a social competition.

## Responsive

- [ ] Desktop complete.
- [ ] Tablet portrait complete.
- [ ] Tablet landscape complete.
- [ ] Mobile portrait complete.
- [ ] Mobile is intentionally composed rather than simply stacked.
- [ ] No horizontal scrolling is required.
- [ ] No core action depends on hover.
- [ ] Touch targets are comfortable.

## Accessibility

- [ ] Focus states supplied.
- [ ] Contrast reviewed.
- [ ] Text can enlarge.
- [ ] Reading order is meaningful.
- [ ] State does not rely on colour alone.
- [ ] Reduced motion considered.
- [ ] Keyboard interaction considered.

## Handoff

- [ ] Design tokens documented.
- [ ] Components documented.
- [ ] Component states documented.
- [ ] Responsive changes documented.
- [ ] Loading states documented.
- [ ] Empty states documented.
- [ ] Error states documented.
- [ ] Unavailable states documented.
- [ ] Mission-specific screens linked to their Mission Build Brief.
- [ ] Unresolved design decisions documented.

---

## DESIGN NORTH STAR

**Warm enough to feel human.  
Structured enough to feel capable.  
Quiet enough to let the child think.  
Tactile enough to make the work feel real.  
Flexible enough to support the next mission.**

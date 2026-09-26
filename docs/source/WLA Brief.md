Yes. I’ve reviewed the four documents as a single system rather than treating them as separate briefs:

- **Designer Brief** — defines what you are responsible for designing, the visual system, shared Academy components, responsive behaviour, states and handoff requirements.
- **Public Website Master** — defines what the already-designed public website is supposed to contain, its copy, routes and the boundary between the public site and Academy.
- **Designer & Developer Handover Reflections** — clarifies what should be preserved from Lovable and what should change during production.
- **WLA Academy Architecture** — defines the actual Academy product structure, ownership model, mission journey and shared behaviours.

The important conclusion is that **you are not designing a second public website**. You are completing the public-site production work where necessary, while designing an entirely new **learner-facing Academy experience** on top of the locked architecture.

The documents are quite clear on this distinction: the public website helps families _discover → understand → choose → purchase_, while the Academy helps them _access → prepare → engage → continue → complete_.

I don't see a blocking clarification that you need to answer before starting the Academy design. There are, however, some **downstream decisions that should remain explicitly unresolved rather than being invented during design**. I've identified those at the end.

Below is the comprehensive brief I would use as your **master WLA Academy Design & Development Brief** for working in Cursor/Claude.

---

# **WITHIN LAB ACADEMY**

# **Academy Website — Comprehensive Design & Development Brief**

**Status:** Production Design & Development Brief  
**Product:** Within Lab Academy  
**Scope:** Learner-facing Academy \+ shared Academy infrastructure/interface  
**Primary implementation direction:** Supabase \+ production web application  
**Development environment:** Cursor \+ Claude  
**Public website:** Existing Lovable implementation/design is the visual and structural reference; Academy is a new production experience.

---

# **1\. Project Context**

Within Lab Academy (WLA) is a mission-based learning platform for children aged 7–15.

WLA is deliberately different from a conventional online learning platform.

The child is not primarily coming to the website to watch lessons, complete quizzes or consume content. The child comes to **do something meaningful**.

A mission may ask a child to:

- build;
- test;
- investigate;
- decide;
- reflect;
- plan;
- organise;
- respond to a situation;
- change something;
- or work something out.

The Academy exists to provide the digital infrastructure around that experience.

The core principle is:

> **The child does the meaningful work. The Academy manages access, sequence, state, branching, reveal, support, progress and evidence.**

This is important because the Academy must not become an over-designed digital learning environment that competes with the actual mission.

The architecture explicitly establishes:

> **Complexity belongs in the system. Clarity belongs in the experience.**

---

# **2\. What Is Already Designed vs What You Are Designing**

## **2.1 Public website**

A substantial portion of the public-facing WLA website has already been designed in Lovable.

That existing implementation should **not automatically be redesigned**.

The production approach is:

**Preserve → Refine → Connect → Finish**

rather than:

**Redesign → Replace → Rebuild**

The handover document specifically states that the Lovable public-site prototype remains a valid visual and structural reference and should be refined rather than reinterpreted.

Therefore, your public-site work should primarily involve:

- reviewing what already exists;
- correcting inconsistencies;
- completing pages that have not been designed;
- resolving responsive behaviour;
- resolving missing states;
- improving production-level consistency;
- connecting public routes to Academy functionality;
- ensuring the public website and Academy feel like one ecosystem.

## **2.2 Academy**

The retired Lovable Academy is **not** the design reference.

It should not be copied or used as the basis for:

- layout;
- navigation;
- information architecture;
- learner journey;
- interaction patterns;
- screen hierarchy.

The production Academy must be designed from:

1. WLA Academy Architecture;
2. WLA visual system;
3. individual Mission Build Briefs;
4. actual mission assets.

The Designer Brief explicitly establishes this boundary.

So the Academy is effectively a **new product experience**, even though it belongs to the same WLA ecosystem.

---

# **3\. Product Boundary**

The product should be understood as three connected but distinct layers.

## **Layer 1 — Public Website**

### **Purpose**

**Discover → Understand → Choose → Purchase**

This is where a parent/family learns what WLA is and decides whether a mission is appropriate.

Primary public navigation:

**Home | Missions | Labs | Journal | About**

Functional routes include:

**My Missions | Try a Free Mission | View a Mission | Reviews | Buy a Gift | Redeem a Gift**

This structure is locked in the Website Master.

---

# **4\. My Missions**

My Missions sits between the public website and the Academy.

Its job is:

**Purchased / unlocked / redeemed missions → Access \+ Status**

It is not the Academy itself.

It should answer three questions immediately:

1. **What missions do I have?**
2. **What is their current status?**
3. **Where do I continue?**

The three core statuses are:

- Not Started
- In Progress
- Complete

And their corresponding actions are:

| Status      | Primary action |
| ----------- | -------------- |
| Not Started | Open Mission   |
| In Progress | Continue       |
| Complete    | View Mission   |

The Academy Architecture explicitly defines this model and requires completed missions to remain accessible.

---

# **5\. WLA Academy**

The Academy is where the actual mission experience happens.

Its broad journey is:

**Access → Prepare → Engage → Continue → Complete**

The core mission journey is:

**Purchase / Unlock**  
**↓**  
**My Missions**  
**↓**  
**Mission Home**  
**↓**  
**Active Mission**  
**↓**  
**Mission Complete**  
**↓**  
**Mission Trail**  
**↓**  
**My Missions**

This journey is locked.

The Academy therefore needs to feel like a **real product**, not a collection of pages.

It needs:

- authenticated access;
- family/child account relationships;
- mission entitlements;
- persistent mission state;
- mission-specific branching;
- conditional reveals;
- response persistence;
- resource access;
- private evidence handling;
- mission completion;
- return/resume behaviour;
- appropriate permissions;
- mobile usability.

---

# **6\. Primary Users**

There are effectively two user perspectives within the Academy.

## **6.1 Parent / Guardian**

The parent owns:

- the account;
- purchases;
- mission entitlements;
- child profiles;
- permissions;
- privacy/consent;
- parent guidance.

The architecture explicitly establishes that the parent/guardian owns the account, access and permissions.

The parent should **not** be treated as the primary learner.

Their experience should be available when needed without turning the Academy into a parent dashboard.

---

## **6.2 Child**

The child profile owns:

- mission progress;
- mission status;
- mission-specific state;
- resume position;
- saved digital responses;
- Mission Trail evidence.

This distinction is technically important.

Progress must not simply be stored against the parent account because one parent account may contain multiple child profiles.

---

# **7\. Multi-Child Account Model**

A parent may have more than one child.

Therefore:

**Parent account**  
→ Child A  
→ Child B  
→ Child C

Each child has an independent:

- mission collection;
- mission status;
- mission progress;
- saved responses;
- evidence;
- learning record.

Before entering child-specific mission content, the active child must be clear.

### **Required experiences**

Design:

- child profile selection;
- active child indication;
- profile switching;
- relationship between selected child and My Missions;
- appropriate empty states.

The profile interaction should feel:

- simple;
- family-oriented;
- clear;
- lightweight.

It should **not** feel like corporate account/profile management.

---

# **8\. Academy Information Architecture**

The recommended Academy structure is:

AUTHENTICATION  
│  
├── Account  
│  
└── Child Profile Selection  
│  
▼  
MY MISSIONS  
│  
├── Mission A  
│  
├── Mission B  
│  
└── Mission C  
│  
▼  
MISSION HOME  
│  
┌──────┼─────────┐  
│ │ │  
▼ ▼ ▼  
Start Mission For  
/Continue Kit Parents  
│  
▼  
ACTIVE MISSION  
│  
├── Mission Control  
│  
├── Mission Home  
│  
└── Mission Kit  
│  
▼  
MISSION COMPLETE  
│  
▼  
MISSION TRAIL  
│  
▼  
MY MISSIONS

A secondary Academy destination exists:

**Mission Board**

It sits beneath Mission Home and is **not** part of the required mission journey.

---

# **9\. Authentication & Access**

The Academy requires authenticated access.

At a high level, the system needs to support:

- account creation;
- login;
- authenticated session;
- account recovery;
- parent/guardian ownership;
- child profile association;
- mission entitlement;
- authorised mission access.

The underlying technical direction provided for the project is **Supabase** for:

- authentication;
- database;
- mission state;
- private storage;
- response data;
- completion records;
- access permissions.

The architecture should therefore be designed around these capabilities from the beginning rather than building an interface that assumes a different backend.

---

# **10\. My Missions**

## **Purpose**

My Missions is the learner's mission collection.

It should feel immediately understandable.

### **Each mission card should communicate:**

- Mission title;
- Lab;
- age range;
- approximate duration;
- status;
- primary action.

Potential secondary information may include mission imagery where appropriate.

### **Example**

**Mars Bridge Builder**

Challenge Lab  
Ages 7–11 · 60–90 mins

**In Progress**

**Continue →**

---

## **States**

Design at minimum:

### **Populated**

The child has one or more missions.

### **Empty**

No missions assigned/purchased.

Possible messaging:

> No missions yet

Then:

> Explore WLA missions or start with the free mission.

### **Loading**

Used when mission collection/state is being retrieved.

### **Error**

Unable to load missions.

### **Unavailable**

Where the mission itself is temporarily unavailable.

---

# **11\. Mission Card Design**

Mission cards should be treated as reusable system components.

States:

- Not Started;
- In Progress;
- Complete;
- hover;
- focus;
- potentially disabled/unavailable.

Do not communicate status through colour alone.

The status should be understandable through:

- text;
- iconography where appropriate;
- action;
- visual treatment.

The Designer Brief specifically requires meaningful states rather than static happy-path screens.

---

# **12\. Mission Home**

Every mission has a permanent Mission Home.

This is one of the most important Academy screens.

It is the bridge between:

**Owning a mission**

and

**Doing a mission**

It exists:

- before the mission;
- during the mission;
- after completion.

The required areas are:

1. Start / Continue Mission
2. Mission Kit
3. For Parents

The architecture explicitly states that **Start / Continue Mission is the strongest action**.

---

# **13\. Mission Home — Before Starting**

The screen should establish:

- what mission this is;
- who it belongs to;
- what the child is about to do;
- the primary action;
- available resources;
- parent guidance.

Primary CTA:

**Start Mission**

Secondary:

**Mission Kit**

**For Parents**

Do not make the supporting information compete with the start action.

---

# **14\. Mission Home — In Progress**

Once progress exists:

Primary CTA becomes:

**Continue Mission**

The child should be able to understand that they are returning to something already started.

Avoid making the child search for:

- the last screen;
- the previous link;
- the mission URL;
- an email.

The system should know where they were.

---

# **15\. Mission Home — Complete**

After completion:

- show Complete status;
- preserve Mission Kit;
- preserve For Parents;
- preserve relevant Mission Trail information;
- allow return to My Missions.

Do **not** automatically restart the mission.

A replay mechanism is explicitly deferred and should not be invented as part of the core architecture.

---

# **16\. Mission Kit**

Mission Kit is the permanent home for resources **provided by WLA**.

Examples include:

- Child Mission;
- Town Map;
- cards;
- trackers;
- printable materials;
- mission-specific physical resources.

Resources may support:

**View**

**Print**

**Download**

depending on the resource.

The resources remain available:

- before the mission;
- during the mission;
- after completion.

Opening or downloading a resource must not change mission progress.

---

# **17\. Critical Mission Kit vs Mission Trail Distinction**

This distinction should be visible in both the UX and the architecture.

### **Mission Kit**

**What WLA gives the child.**

Examples:

- printable mission;
- map;
- cards;
- tracker.

### **Mission Trail**

**What the child generates through their practice.**

Examples:

- decision;
- test result;
- changed plan;
- reflection;
- uploaded evidence.

The two must never visually collapse into one generic "files" area.

---

# **18\. For Parents**

For Parents is not another dashboard.

It is a dedicated place for adult guidance associated with the mission.

Primary content:

**Mission Note for Parents**

It should be:

- easy to locate;
- clearly adult-facing;
- visually secondary;
- available before, during and after the mission.

Opening it must not change mission state.

---

# **19\. Active Mission**

This is the actual doing environment.

It should be the **quietest and most focused part of the WLA product**.

The public website can be editorial and expressive.

My Missions can be functional.

Mission Home can orient the child.

But Active Mission should minimise everything that is not necessary for the current task.

The design should prioritise:

- instruction hierarchy;
- obvious next action;
- readable content;
- restrained colour;
- comfortable touch targets;
- minimal competing UI;
- concentration.

The Designer Brief explicitly says not to fill empty space merely because it exists.

---

# **20\. Active Mission Is a Reusable Shell**

This is a major development principle.

Do **not** build each mission as an entirely separate website/application.

Instead:

> **Build the capability once, then configure different missions around it.**

The shared shell should accommodate different mission types while allowing individual missions to define:

- screens;
- branches;
- responses;
- reveals;
- physical handoffs;
- Mission Control;
- completion logic.

The Academy Architecture deliberately separates shared platform behaviour from mission-specific behaviour.

---

# **21\. Mission Components**

The reusable mission system should support components such as:

### **Instruction / Content Screen**

For:

- introductions;
- explanations;
- contextual information;
- instructions.

### **Choice**

For:

- multiple options;
- decisions;
- selections.

### **Response**

For:

- short text;
- simple confirmations;
- structured inputs.

### **Branch**

The child's choice changes what happens next.

### **Conditional Reveal**

Content remains concealed until a specified condition is satisfied.

### **Download / Resource**

Connects the learner to a Mission Kit resource.

### **Physical Handoff**

Tells the child to leave the screen and do something physical.

### **Return Point**

Explicitly tells the child when and where to return.

### **Mission Control**

Reusable support interface.

### **Completion**

Marks the mission complete when approved conditions are met.

This is the core of making WLA scalable.

---

# **22\. Mission State**

The system needs to remember more than simply:

**started / not started.**

At minimum, it needs to know:

- child profile;
- mission entitlement;
- current status;
- current position;
- whether mission is complete.

Mission-specific state may additionally include:

- screens viewed;
- choices selected;
- branches established;
- information revealed;
- responses saved;
- physical handoff state;
- Mission Control interactions where relevant;
- evidence generated.

The exact state fields should be defined by individual Mission Build Briefs.

The shared architecture should **not force every mission into the same sequence**.

---

# **23\. Pause & Resume**

Pause-and-return is a **normal product behaviour**, not an exception.

A child may leave:

- to do physical work;
- for a break;
- later that day;
- another day.

When they return:

- status remains correct;
- digital actions persist;
- branches remain established;
- revealed information remains revealed;
- saved responses remain;
- Continue returns them to the appropriate state.

The mission must not depend on an open browser tab.

---

# **24\. Screen → Physical Handoff**

This is particularly important because WLA is screen-light.

When the Academy tells a child to leave the screen, the interface should clearly communicate:

### **Where do I go?**

### **What do I do?**

### **When do I come back?**

The Academy should **orchestrate** the physical activity rather than recreate it digitally.

For example:

PAUSE HERE

Your next step happens away from the screen.

1\. Open your Mission Kit.  
2\. Take the bridge sheet.  
3\. Build your first bridge.  
4\. Test it.

Come back when you're ready to compare your results.

\[ I'm ready \]

This is an example of the interaction pattern, not approved mission copy.

The architecture explicitly says:

> **Use technology for orchestration. Preserve physical interaction for thinking, doing and evidence.**

---

# **25\. Mission Control**

Mission Control is a reusable support component.

It should feel:

- available;
- calm;
- optional;
- supportive;
- secondary.

It should **not** feel like:

- the answer;
- a reward;
- a rescue button;
- a hint ladder.

It opens without advancing the mission and closes back to the same point.

It must not reveal concealed information or solve the mission.

Mission-specific Mission Control content belongs in the relevant Mission Build Brief.

---

# **26\. Mission Completion**

Completion should communicate:

- the mission is complete;
- the child's work still exists;
- they can return to My Missions;
- their Mission Trail remains theirs.

The emotional objective is:

> **Closure \+ evidence, not performance.**

Avoid:

- scores;
- points;
- badges;
- confetti;
- leaderboards;
- game-like rewards.

The architecture requires a clear return to My Missions and states that completion should not be blocked by an upsell.

---

# **27\. Mission Trail**

Mission Trail is one of the most distinctive parts of WLA.

It is the child's **private record of selected evidence**.

It is not:

- a social profile;
- a leaderboard;
- a public gallery;
- a scorecard.

Evidence can exist in two forms.

## **Physical evidence**

Something the child keeps physically.

For example:

- a build;
- marked-up paper;
- changed plan;
- physical artefact.

The Academy may record that such evidence belongs to the Trail without pretending it has a digital copy.

## **Digital evidence**

Something actually stored by the Academy.

For example:

- a response;
- uploaded image;
- saved artefact;
- reflection.

The interface must make the distinction clear.

The Designer Brief explicitly warns against implying that the Academy stores physical artefacts when it does not.

---

# **28\. Evidence Uploads**

Where a mission genuinely requires digital evidence upload, the system needs:

- upload;
- upload progress;
- success;
- failure;
- retry;
- private storage;
- association with child profile;
- association with mission;
- appropriate permissions.

But **upload should not become a compulsory feature simply because the technology supports it**.

If a physical artefact is supposed to remain physical, keep it physical.

---

# **29\. Mission Board**

Mission Board is an Academy-wide secondary destination.

It provides a window into selected, anonymised WLA practice.

It is:

- optional;
- secondary;
- non-competitive;
- not part of the core mission path.

It must not become:

- a social feed;
- a leaderboard;
- a ranking system;
- a comparison mechanism.

The detailed contribution and moderation workflow is explicitly deferred.

Therefore, for the current design:

**Design the destination and viewing experience only where sufficiently defined.**

Do not invent:

- submission workflows;
- moderation dashboards;
- voting;
- likes;
- comments;
- ranking;
- public profiles.

---

# **30\. Academy Visual Direction**

The Academy must unmistakably belong to WLA.

However, it should be **quieter than the public website**.

The visual progression should be:

PUBLIC WEBSITE  
Editorial  
Warm  
Expressive  
Atmospheric  
↓  
MY MISSIONS  
Functional  
Clear  
Organised  
↓  
MISSION HOME  
Orienting  
Calm  
Practical  
↓  
ACTIVE MISSION  
Quiet  
Focused  
Task-led

The Designer Brief describes the overall WLA character as:

- warm;
- tactile;
- thoughtful;
- capable;
- structured;
- calm;
- quietly adventurous.

---

# **31\. Visual Metaphor**

The useful internal metaphor is:

> **A beautifully organised field desk before an expedition.**

But this is a mood reference, not a literal visual theme.

The Academy should **not** become:

- rustic;
- camping-themed;
- overly adventurous;
- costume-like;
- game-like.

The visual world should instead communicate:

**thinking → trying → noticing → changing → evidence**

---

# **32\. Colour System**

Use the established WLA palette.

| Token          | Colour    | Primary use             |
| -------------- | --------- | ----------------------- |
| Warm Cream     | `#F5EFE3` | Primary canvas          |
| Charcoal Brown | `#3A2F2A` | Primary text            |
| Deep Olive     | `#5F6A4F` | Primary interaction/CTA |
| Soft Sage      | `#A3B18A` | Supporting surfaces     |
| Clay           | `#B87C5A` | Small accents           |

Warm Cream should carry the visual system.

Sage and Clay should support rather than compete.

Do not make each Lab its own colour brand. The five Labs belong to one WLA system.

---

# **33\. Typography**

The typographic principle is:

> **Editorial warmth \+ practical clarity.**

Use no more than two principal type families:

1. warm editorial serif/display;
2. highly legible humanist sans.

The current public prototype's pairing should be carried into the Academy unless there is a strong production reason to change it.

The Academy should prioritise:

- readable instructions;
- clear hierarchy;
- comfortable line length;
- strong functional labels;
- excellent mobile readability.

---

# **34\. Shape & Layout**

The Academy should feel spacious without feeling empty.

Use:

- clear hierarchy;
- whitespace;
- purposeful grouping;
- restrained surface changes;
- moderately softened corners.

Avoid:

- excessive pills;
- bubbly UI;
- floating SaaS dashboard aesthetics;
- heavy shadows;
- excessive cards;
- dividers everywhere.

The design brief explicitly says:

> **Do not default to cards.**

Cards should exist only where they genuinely improve organisation or interaction.

---

# **35\. Imagery**

The Academy should use imagery sparingly.

WLA's visual system is **people-free**.

Avoid relying on:

- faces;
- hands;
- bodies;
- classroom photography.

Instead, show the child's presence through:

- work;
- objects;
- materials;
- changed artefacts;
- evidence;
- process.

This keeps the visual identity distinctive and aligns with WLA's privacy philosophy.

---

# **36\. Responsive Requirements**

The Academy must be designed for:

- desktop;
- smartphone portrait;
- tablet portrait;
- tablet landscape.

The Academy must **not depend on desktop**.

Important areas to explicitly design across breakpoints:

- navigation;
- child-profile selection;
- My Missions;
- mission cards;
- Mission Home;
- Mission Kit;
- response controls;
- Mission Control;
- overlays;
- long instructions;
- completion;
- Trail.

The mobile experience should not simply be the desktop design stacked vertically.

The Designer Brief explicitly requires deliberate responsive design and annotation of meaningful differences.

---

# **37\. Accessibility**

The Academy needs to account for:

- sufficient contrast;
- visible focus;
- comfortable touch targets;
- readable type;
- text enlargement;
- keyboard navigation;
- reduced motion;
- non-colour state communication;
- meaningful reading order.

Avoid:

- tiny interaction targets;
- precision-dependent interaction;
- hover-only explanations;
- state communicated only through colour.

---

# **38\. Interaction & Motion**

Motion should communicate:

- orientation;
- state;
- transition.

Appropriate:

- subtle panel transitions;
- accordion movement;
- navigation transitions;
- state changes.

Avoid:

- confetti;
- bouncing;
- spinning;
- game-like rewards;
- excessive animation;
- heavy parallax.

WLA should feel alive but not animated for the sake of animation.

---

# **39\. Shared Component System**

The Academy should be built around a reusable component system.

Core shared components should include:

### **Navigation**

- desktop;
- mobile;
- current state;
- focus;
- open/closed.

### **Buttons**

- default;
- hover;
- focus;
- pressed;
- disabled.

### **Mission Cards**

- Not Started;
- In Progress;
- Complete;
- hover;
- focus.

### **Profile Selector**

- default;
- selected;
- switching;
- loading;
- empty/error where necessary.

### **Mission Home**

Reusable shell with:

- mission information;
- status;
- Start/Continue;
- Mission Kit;
- For Parents.

### **Resource Item**

- view;
- print;
- download;
- unavailable/error.

### **Parent Note**

Adult-facing access component.

### **Instruction Panel**

Reusable mission content structure.

### **Choice Controls**

- available;
- selected;
- confirmed;
- locked;
- revealed.

### **Response Inputs**

- default;
- focused;
- error;
- success;
- disabled.

### **Mission Control**

Reusable support component.

### **Completion**

Reusable completion state.

### **Dialogs / overlays**

For confirmations and appropriate system interactions.

---

# **40\. System States**

This is particularly important for the Claude/Cursor implementation.

Do not provide only "finished" screens.

Design:

### **Loading**

What does the learner see while data is loading?

### **Empty**

What happens when there is nothing to show?

### **Error**

What happens when something fails?

### **Unavailable**

What happens when a resource or mission cannot currently be accessed?

### **Restoring**

What happens if the system is restoring saved mission state?

### **Upload failure**

What happens when evidence cannot be uploaded?

### **Network interruption**

What does the user see when connectivity is interrupted?

The designer brief specifically requires these states to be resolved rather than leaving development to invent them.

---

# **41\. Technical Product Model**

The implementation should broadly separate:

### **Account**

Parent/guardian identity.

### **Child Profile**

Learner identity within the family account.

### **Mission**

Reusable mission definition.

### **Mission Entitlement**

Whether a child has access to a mission.

### **Mission State**

The child's current state within that mission.

### **Mission Response**

Saved response/input data.

### **Mission Evidence**

Digital evidence belonging to the child.

### **Mission Resource**

WLA-provided Mission Kit content.

### **Mission Completion**

Completion record/state.

This allows the system to separate:

**what the mission is**

from

**what a specific child has done inside it.**

That distinction is fundamental to making future missions configurable rather than custom-coded.

---

# **42\. Suggested Supabase Data Model**

This is an implementation-oriented interpretation of the approved architecture, rather than a locked database schema.

A sensible initial structure would be conceptually:

profiles  
↓  
child\_profiles  
↓  
mission\_entitlements  
↓  
missions  
↓  
mission\_progress  
↓  
mission\_responses  
↓  
mission\_evidence

And separately:

missions  
↓  
mission\_resources

and:

missions  
↓  
mission\_parent\_notes

Mission configuration can then reference reusable mission components rather than hard-coded page implementations.

The exact schema should be validated by the developer before implementation.

---

# **43\. Mission Configuration Model**

The long-term objective is:

> **New mission \= configuration \+ content \+ assets, not an entirely new application.**

Conceptually:

Mission  
├── metadata  
├── access rules  
├── resources  
├── parent note  
├── screens  
│ ├── content  
│ ├── choices  
│ ├── responses  
│ ├── reveals  
│ ├── branches  
│ ├── physical handoffs  
│ └── completion  
└── mission-specific state

The developer should avoid creating:

MarsBridgeBuilder.jsx  
SixNames.jsx  
FutureMission.jsx  
AnotherMission.jsx

as completely independent application structures where shared capability could instead be configured.

The architecture's purpose is specifically to allow future Mission Build Briefs to inherit the shared Academy behaviour.

---

# **44\. Entitlement & Access Logic**

The access model should distinguish between:

- free mission;
- purchased mission;
- gifted mission;
- redeemed mission;
- assigned child;
- unauthorised mission.

The functional outcome is:

Purchase / Unlock  
↓  
Entitlement  
↓  
Assign to child  
↓  
My Missions  
↓  
Mission Home

The child should never gain access to another child's mission progress simply because both belong to the same parent account.

---

# **45\. Parent / Child Security Model**

This is not merely a UX distinction.

It should be reflected in permissions.

At a high level:

### **Parent**

Can manage:

- account;
- children;
- purchases;
- entitlements;
- relevant permissions;
- parent-facing information.

### **Child**

Can access:

- their own missions;
- their own progress;
- their own responses;
- their own Mission Trail.

The system should prevent cross-child access to:

- progress;
- evidence;
- responses;
- mission state.

Supabase Row Level Security should be considered a core part of this architecture rather than relying solely on frontend route protection.

---

# **46\. Privacy by Design**

WLA's privacy principles should influence the actual product design.

The public master states that children do not need to provide:

- faces;
- public full names;
- school names;
- identifiable home information;
- unnecessary sensitive information.

Mission Trail is private by default. Sharing is optional and subject to appropriate parent/guardian permission.

Therefore:

- do not expose child profiles publicly;
- do not create public learner profiles;
- do not create unnecessary social functionality;
- do not make evidence sharing the default;
- do not collect unnecessary data.

---

# **47\. What the Academy Should NOT Become**

The following are explicitly outside the current design scope:

- subscriptions;
- points;
- badges;
- streaks;
- rankings;
- leaderboards;
- social profiles;
- chat;
- notifications;
- My Missions search/filter;
- mission replay;
- public Mission Trail sharing;
- compulsory uploads;
- Mission Board contribution/moderation system.

These should not be quietly added because they appear technically easy or because Claude suggests them.

---

# **48\. Public Website → Academy Connection**

The ecosystem should feel continuous.

Example:

### **Public website**

**Mars Bridge Builder**

Challenge Lab · Ages 7–11 · 60–90 mins

**See Mission →**

↓

### **Mission Detail**

**Get Mars Bridge Builder — ₦X**

↓

### **Purchase**

↓

### **My Missions**

**Mars Bridge Builder**

Status: Not started

**Open Mission →**

↓

### **Mission Home**

**Mars Bridge Builder**

**Start Mission**

↓

### **Active Mission**

The actual experience begins.

This connection is one of the most important things to get right in development.

---

# **49\. Free Mission Journey**

The approved product outcome includes a Try a Free Mission route.

Conceptually:

Public Website  
↓  
Try a Free Mission  
↓  
Authentication / account  
↓  
Child assignment where required  
↓  
My Missions  
↓  
Open Mission  
↓  
Mission Home  
↓  
Active Mission

The exact onboarding mechanics should be based on the approved implementation decisions rather than invented.

---

# **50\. Gift Mission Journey**

The public site establishes:

**Buy a Gift → child’s parent/guardian receives access**

The Academy therefore needs to accommodate gifted entitlements.

The important product principle is:

**The purchaser and the child/family receiving access may not be the same person.**

Do not collapse gifting into ordinary purchasing without accounting for that distinction.

The exact gift redemption UX is one of the areas that should be confirmed from the separate commerce/gift requirements before detailed implementation.

---

# **51\. Editable Content**

The implementation should allow the client to manage content that is reasonably expected to change after launch.

At minimum:

- Journal articles;
- Journal categories;
- mission catalogue information;
- Mission Detail information;
- other agreed editable fields.

The important architectural principle is:

> **Avoid unnecessary complexity.**

Not everything needs to become a CMS.

The editable content boundary should be intentional.

---

# **52\. Mission Content vs Mission Engine**

This is an important distinction for development.

### **Mission Engine**

Reusable functionality:

- state;
- navigation;
- branches;
- reveals;
- responses;
- persistence;
- completion;
- Mission Control;
- evidence.

### **Mission Content**

Configured information:

- text;
- instructions;
- choices;
- images;
- downloads;
- branches;
- reveals;
- response prompts;
- completion criteria.

This separation is what allows WLA to become a long-term platform rather than a one-off build.

---

# **53\. Analytics**

The system should support useful product analytics.

At minimum, the technical requirements identify:

- mission starts;
- mission completion;
- drop-off.

Additional analytics should be considered only where they serve a genuine product question.

Avoid turning children into an engagement-optimisation dataset.

Useful product questions are things such as:

- Where are children abandoning a mission?
- Which missions are started but rarely completed?
- Which screens repeatedly cause problems?
- Which mission types require more support?

---

# **54\. Error Logging & Monitoring**

Production should have:

- application error logging;
- monitoring;
- meaningful error states;
- appropriate recovery paths.

This is especially important because mission state is persistent.

A silent error that causes a child to lose progress is significantly more serious than an ordinary marketing-page rendering issue.

---

# **55\. Backup & Versioning**

The project should have a reliable approach to:

- database backup;
- content versioning;
- mission configuration changes;
- asset management;
- recovery.

Mission content should not be changed in a way that unexpectedly breaks an active learner's existing mission state.

This is another reason to separate:

**mission definition**

from

**learner state.**

---

# **56\. Development Philosophy for Claude \+ Cursor**

When you start development, I would strongly recommend that Claude is instructed **not to redesign the product while implementing it**.

The development hierarchy should be:

1\. Locked Academy Architecture  
2\. Approved Mission Build Brief  
3\. Approved Designer Brief  
4\. Existing WLA visual system  
5\. Technical implementation constraints  
6\. Developer judgement

If Claude encounters ambiguity:

**Do not invent a new product behaviour.**

Instead:

1. identify the ambiguity;
2. check the architecture;
3. check the relevant mission brief;
4. check the design;
5. propose the smallest reasonable implementation;
6. flag anything requiring product approval.

This aligns directly with the designer handoff instruction not to silently rewrite architecture through interface design.

---

# **57\. Recommended Build Order**

I would divide your work into these phases.

## **Phase 1 — Foundation**

Before designing individual missions:

- visual tokens;
- typography;
- colours;
- spacing;
- radii;
- buttons;
- inputs;
- navigation;
- dialogs;
- states;
- responsive rules.

---

## **Phase 2 — Account Layer**

Build/design:

- login;
- account creation;
- account recovery;
- parent account;
- child profiles;
- profile switching;
- session handling.

---

## **Phase 3 — Mission Collection**

Build:

- My Missions;
- mission cards;
- status system;
- empty state;
- loading state;
- error state;
- child-specific mission filtering.

---

## **Phase 4 — Mission Home**

Build:

- mission identity;
- Start;
- Continue;
- Complete;
- Mission Kit;
- For Parents;
- mission status.

---

## **Phase 5 — Mission Engine**

Build reusable components for:

- instructions;
- choices;
- responses;
- branches;
- reveals;
- physical handoffs;
- Mission Control;
- completion.

This is arguably the **most important technical phase**.

---

## **Phase 6 — Persistence**

Connect:

- mission state;
- resume position;
- responses;
- branches;
- reveals;
- completion.

---

## **Phase 7 — Evidence**

Implement:

- Mission Trail;
- digital evidence;
- physical evidence distinction;
- private storage;
- appropriate upload behaviour.

---

## **Phase 8 — First Mission**

Only after the shared system exists:

**Apply the first approved Mission Build Brief.**

This allows the first mission to test the system rather than becoming the system.

---

## **Phase 9 — QA**

Test:

- desktop;
- mobile;
- tablet;
- authentication;
- permissions;
- child switching;
- mission state;
- interruption;
- resume;
- completion;
- evidence;
- resource access;
- errors.

---

# **58\. Your Design Deliverables**

As designer, your final Academy package should include:

### **Foundation**

- colour tokens;
- typography;
- spacing;
- layout grid;
- radius;
- component rules.

### **Academy**

- profile selection;
- My Missions;
- Mission Home;
- Mission Kit;
- For Parents;
- Active Mission shell;
- Mission Control;
- Mission Complete;
- Mission Trail;
- Mission Board destination where sufficiently defined.

### **Components**

- navigation;
- buttons;
- mission cards;
- status;
- forms;
- response controls;
- dialogs;
- resource items;
- instruction panels.

### **States**

- loading;
- empty;
- error;
- unavailable;
- interrupted/restoring;
- success;
- disabled;
- selected;
- locked;
- revealed.

### **Responsive**

- desktop;
- tablet landscape;
- tablet portrait;
- smartphone portrait.

### **Handoff**

- annotated responsive behaviour;
- interaction behaviour;
- component variants;
- design tokens;
- asset inventory;
- unresolved-design list.

These requirements are consistent with the formal Designer Brief handoff requirements.

---

# **59\. Academy Design Acceptance Criteria**

Before you consider the Academy design complete, ask:

### **Product**

- Is the parent/child relationship clear?
- Is the active child always clear?
- Can the child find their missions immediately?
- Can they understand mission status?
- Can they resume without searching?
- Does every mission have a permanent Mission Home?
- Is Start/Continue the dominant action?
- Can the child access Mission Kit independently?
- Can the parent access guidance without entering the child flow?
- Is Mission Control clearly optional?
- Can the child leave and return without losing their place?
- Is completion meaningful but not gamified?
- Is Mission Trail clearly private?
- Is Mission Board clearly secondary?

### **Design**

- Does it still feel like WLA?
- Is the Academy quieter than the public website?
- Is the mission more important than the interface?
- Is there enough space for concentration?
- Are cards used only where useful?
- Are status states understandable without colour?
- Are physical handoffs obvious?
- Does mobile feel intentionally designed?

### **Technical**

- Can a future mission use the same system?
- Is mission content separated from learner state?
- Is progress persisted?
- Are child permissions isolated?
- Can resources exist independently of progress?
- Can completed missions remain accessible?
- Can evidence remain private?
- Are errors recoverable?
- Is the architecture maintainable?

---

# **60\. Important Things Not to Decide Yourself Yet**

There are a few areas where I would **not** recommend you filling the gaps through design assumptions.

## **1\. Exact authentication/onboarding flow**

The architecture establishes the account model, but the documents do not fully specify every authentication screen and onboarding sequence.

So decide this before detailed implementation.

## **2\. Exact child-profile creation flow**

We know profiles exist and must be selected/switched, but the full creation/editing experience is not fully specified.

## **3\. Exact purchase → child assignment flow**

The architecture establishes entitlement and child ownership, but the complete commerce UX needs to remain aligned with the approved purchasing implementation.

## **4\. Gift redemption flow**

The public website confirms the route exists, but detailed gift UX should come from the approved gift requirements rather than being invented.

## **5\. Mission Board contribution/moderation**

Explicitly deferred by the architecture.

## **6\. Mission replay**

Explicitly deferred.

## **7\. My Missions search/filter**

Explicitly deferred until mission volume creates a need.

## **8\. Notifications**

Explicitly deferred.

## **9\. Individual mission screens**

These should only be designed when the relevant **Mission Build Brief** is approved. The Academy architecture provides the shell; the Mission Build Brief defines the actual experience inside it.

---

# **61\. The Most Important Mental Model for You**

I think this is the key thing to carry into the project:

### **You are not designing an "Academy website."**

You are designing a **mission delivery system with a website interface**.

The hierarchy is:

WLA  
│  
├── Public Website  
│ └── Helps families choose  
│  
├── My Missions  
│ └── Helps children return  
│  
└── Academy  
│  
├── Mission Home  
│  
│ ├── Start / Continue  
│ ├── Mission Kit  
│ └── For Parents  
│  
└── Active Mission  
│  
├── Instructions  
├── Choices  
├── Branches  
├── Reveals  
├── Physical handoffs  
├── Responses  
├── Mission Control  
└── Completion

And beneath all of that:

AUTHENTICATION  
↓  
CHILD PROFILE  
↓  
ENTITLEMENT  
↓  
MISSION STATE  
↓  
EVIDENCE

That is the actual product.

---

# **62\. Final Product Principle**

The strongest principle emerging consistently from all four documents is:

> **The interface should enable the experience without becoming the experience.**

The public website can intrigue the parent.

My Missions can organise access.

Mission Home can orient the child.

The Academy can guide the child.

But once the mission begins, **the child's thinking, making, deciding, testing and noticing should become the centre of the experience.**

That is why the production Academy should be quieter than the public site, why physical work should remain physical, why Mission Control should remain secondary, why completion should avoid gamification, and why the Mission Trail should focus on evidence rather than scores.

The existing handover captures the broader production philosophy particularly well: the objective is to make WLA feel **complete, not busier**.

### **What I would do next**

Before you start prompting Claude to build, I would **not jump directly into coding**.

The next useful step is to turn this brief into a **concrete Academy implementation blueprint** containing:

1. **Complete Academy sitemap/routes**
2. **Every screen that needs to be designed**
3. **Every state for each screen**
4. **Detailed user flows**
5. **Parent vs child permissions**
6. **Supabase data model**
7. **Mission engine/component architecture**
8. **What should be hard-coded vs database-driven**
9. **Recommended Cursor project structure**
10. **Claude coding rules/instructions**
11. **Development phases and milestones**
12. **A screen-by-screen Figma design checklist**
13. **A technical/design QA checklist**

That would give you something much more actionable than a general brief: essentially a **single source of truth you can keep beside you while designing in Figma and building in Cursor**, while still respecting the locked WLA Architecture.

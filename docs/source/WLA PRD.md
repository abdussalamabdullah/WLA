Absolutely. Based on the four WLA source documents, I would structure the PRD as a **product requirements document for the production Academy MVP**, not as a generic LMS specification.

I am deliberately keeping the scope tight. In particular, I am **not turning deferred ideas such as notifications, mission replay, search/filter, Mission Board submission/moderation, social features or gamification into MVP requirements**. The Academy Architecture explicitly defers those decisions.

# **Within Lab Academy — MVP Product Requirements Document**

**Product:** Within Lab Academy  
**Document:** MVP Product Requirements Document  
**Status:** Production MVP  
**Primary users:** Parents/guardians and children aged 7–15  
**Primary backend direction:** Supabase  
**Primary build environment:** Cursor \+ Claude  
**Hosting direction:** Vercel, with Cloudflare/domain and Supabase backend as outlined in the handover.

---

# **1\. Product Summary**

Within Lab Academy is the private digital environment where children access and complete WLA missions.

The public WLA website is responsible for:

> **Discover → Understand → Choose → Purchase**

The Academy is responsible for:

> **Access → Prepare → Engage → Continue → Complete**

The Academy is therefore **not a conventional online course platform**.

A WLA mission may involve physical materials, printed resources, decision-making, building, testing, reflection or other real-world activity. The Academy provides the digital structure around that experience.

The central product principle is:

> **The child does the meaningful work. The Academy manages access, sequence, state, branching, reveal, support, progress and evidence.**

The architecture also establishes:

> **Complexity belongs in the system. Clarity belongs in the experience.**

---

# **2\. MVP Goal**

The MVP should prove that WLA can deliver a complete mission experience digitally while keeping the actual learning activity primarily with the child.

The MVP must allow a family to:

1. create/access an account;
2. have one or more child profiles;
3. access a free, purchased or otherwise unlocked mission;
4. see that mission in My Missions;
5. open its permanent Mission Home;
6. prepare for the mission;
7. start the mission;
8. complete mission-specific digital interactions;
9. leave and return without losing progress;
10. complete the mission;
11. retain access to the completed mission;
12. view relevant Mission Trail evidence.

The MVP should establish the reusable foundation for future missions without requiring a completely new application for each mission.

---

# **3\. Product Principles**

These principles should guide every product and development decision.

### **3.1 The mission comes first**

The interface supports the mission rather than becoming the mission.

### **3.2 Build reusable capability**

Future missions should primarily require configuration and content rather than completely new development.

### **3.3 Keep the Academy quiet**

The public website may be editorial and expressive.

The Academy should be functional, calm and focused.

### **3.4 Preserve physical activity**

Technology should orchestrate physical work rather than unnecessarily recreate it digitally.

### **3.5 Progress must persist**

Leaving the Academy must not mean losing the child's place.

### **3.6 Parent and child are different roles**

The parent owns the account and permissions.

The child owns their mission progress and learning record.

### **3.7 Privacy by default**

Mission evidence and child information should remain private unless an approved sharing mechanism exists.

### **3.8 Do not build speculative functionality**

If the product requirement is not approved, it should not become an MVP feature simply because it is technically possible.

---

# **4\. MVP Scope**

## **In scope**

| Area                                | MVP                                              |
| ----------------------------------- | ------------------------------------------------ |
| Authentication                      | Yes                                              |
| Parent account                      | Yes                                              |
| Child profiles                      | Yes                                              |
| Multiple child profiles             | Yes                                              |
| Child profile switching             | Yes                                              |
| Mission entitlement/access          | Yes                                              |
| My Missions                         | Yes                                              |
| Mission status                      | Yes                                              |
| Mission Home                        | Yes                                              |
| Mission Kit                         | Yes                                              |
| For Parents                         | Yes                                              |
| Active Mission shell                | Yes                                              |
| Mission components                  | Yes                                              |
| Branching                           | Yes, where mission requires it                   |
| Conditional reveals                 | Yes, where mission requires it                   |
| Short responses                     | Yes, where mission requires it                   |
| Pause/resume                        | Yes                                              |
| Mission Control                     | Yes, where mission requires it                   |
| Mission completion                  | Yes                                              |
| Mission Trail                       | Yes                                              |
| Digital evidence                    | Yes, where required by mission                   |
| Physical evidence tracking          | Yes, where required by mission                   |
| Responsive mobile/tablet experience | Yes                                              |
| Secure permissions                  | Yes                                              |
| Payment/checkout integration        | Yes, as required for standalone mission purchase |
| Transactional purchase/access email | Yes, where required                              |
| Basic mission analytics             | Yes                                              |
| Error logging                       | Yes                                              |
| Backup/versioning                   | Yes                                              |
| Journal CMS                         | Public website scope, not Academy core           |
| Mission catalogue editing           | Yes                                              |
| Mission Detail editing              | Yes                                              |

The architecture specifically defines the shared Academy elements above as part of the core platform.

---

# **5\. Explicitly Out of MVP Scope**

These should **not** be added unless the client separately approves them.

### **Not included**

- mission replay;
- My Missions search;
- My Missions filtering;
- notifications;
- leaderboards;
- rankings;
- points;
- badges;
- streaks;
- gamification;
- public child profiles;
- child-to-child communication;
- chat;
- social feed;
- comments;
- likes;
- public Mission Trail;
- automatic evidence sharing;
- Mission Board submission workflow;
- Mission Board moderation system;
- complex parent dashboard;
- global resource library;
- subscription management.

The Academy Architecture explicitly defers mission replay, search/filter and notifications, while Mission Board submission/moderation is also deferred.

---

# **6\. User Roles**

The MVP has two primary roles.

## **6.1 Parent/Guardian**

The parent/guardian:

- owns the account;
- manages child profiles;
- owns mission access/entitlements;
- manages account-level information;
- has access to parent guidance;
- controls applicable privacy/consent permissions.

## **6.2 Child**

The child:

- accesses assigned missions;
- performs mission activities;
- creates mission progress;
- provides responses where required;
- generates evidence;
- completes missions;
- views their Mission Trail.

The child should not need access to parent account-management functionality.

---

# **7\. Account & Child Profile Requirements**

## **7.1 Parent account**

The system shall allow a parent/guardian to:

- create an account;
- authenticate;
- maintain a session;
- access their available missions;
- manage child profiles.

Authentication should use the approved Supabase direction.

---

## **7.2 Child profiles**

A parent account may have multiple child profiles.

Each child profile shall have its own:

- mission access;
- mission status;
- mission progress;
- saved responses;
- mission state;
- Mission Trail evidence.

Mission progress must **not** be stored only against the parent account.

This is a locked architectural requirement.

---

## **7.3 Active child**

Where multiple children exist, the system shall make the active child clear before child-specific mission access.

Changing the active child shall change the mission collection and progress shown.

### **Acceptance criteria**

- Parent can see available child profiles.
- Parent can select a child.
- Current child is visually identifiable.
- My Missions reflects the selected child.
- One child's progress cannot appear in another child's profile.

---

# **8\. Authentication Requirements**

MVP authentication should support the minimum required account lifecycle:

- registration;
- login;
- logout;
- authenticated session;
- password/account recovery as supported by the chosen authentication mechanism.

Do not build unnecessary authentication methods or identity providers at MVP stage unless required by the client.

---

# **9\. Mission Entitlement**

The system must understand whether a particular child has access to a particular mission.

Access may originate from:

- free mission access;
- purchase;
- gift/redemption;
- other approved unlock mechanism.

The important distinction is:

> **Mission catalogue ≠ mission entitlement ≠ mission progress.**

A mission existing in the system does not mean a child owns it.

A parent having an account does not automatically mean every child has access to every mission.

---

# **10\. My Missions**

## **Objective**

Provide the child's available mission collection and current status.

The user should immediately understand:

> **What missions do I have?**

> **What is my status?**

> **Where do I continue?**

---

## **Mission card information**

Each card should show:

- mission name;
- Lab;
- age range;
- approximate duration;
- status;
- primary action.

---

## **Statuses**

### **Not Started**

CTA:

**Open Mission**

### **In Progress**

CTA:

**Continue**

### **Complete**

CTA:

**View Mission**

These statuses and actions are explicitly defined by the Academy Architecture.

---

## **My Missions states**

The MVP shall support:

### **Populated**

At least one accessible mission.

### **Empty**

No accessible missions.

### **Loading**

Mission data is being retrieved.

### **Error**

Mission data cannot be retrieved.

### **Unavailable**

Where a previously available mission cannot currently be opened.

---

# **11\. Mission Home**

Every mission must have a permanent Mission Home.

It exists before, during and after completion.

Its purpose is to bridge:

> **Owning the mission → Doing the mission**

The Mission Home must contain:

1. **Start / Continue Mission**
2. **Mission Kit**
3. **For Parents**

The architecture explicitly makes Start/Continue the primary action.

---

# **12\. Mission Home States**

## **Not Started**

Primary CTA:

**Start Mission**

Supporting access:

- Mission Kit;
- For Parents.

## **In Progress**

Primary CTA:

**Continue Mission**

Supporting access remains available.

## **Complete**

Show:

- Complete status;
- Mission Kit;
- For Parents;
- relevant Mission Trail information.

Do not automatically restart the mission.

---

# **13\. Mission Kit**

Mission Kit is the permanent location for resources supplied by WLA.

Examples:

- Child Mission;
- maps;
- cards;
- trackers;
- printables;
- mission-specific resources.

Resources may support:

- View;
- Print;
- Download.

Resources remain available before, during and after the mission.

Opening/downloading a resource must not change mission progress.

---

# **14\. For Parents**

For Parents provides the parent-facing guidance associated with a mission.

Primary content:

**Mission Note for Parents**

It should remain accessible:

- before the mission;
- during the mission;
- after completion.

Opening the parent note must not change mission state.

It should not become a separate parent dashboard.

---

# **15\. Active Mission**

Active Mission is the actual mission environment.

It is responsible for presenting the current mission step and handling the interaction required at that point.

The shared Active Mission shell must support, where required:

- content/instruction screens;
- choices;
- responses;
- branching;
- conditional reveals;
- physical handoffs;
- Mission Control;
- completion.

The individual Mission Build Brief determines which of these a particular mission uses.

---

# **16\. Mission Engine**

The MVP should establish reusable mission functionality.

The system should be capable of representing missions using reusable components rather than custom-coded experiences.

### **Required reusable capabilities**

| Capability          | Requirement                     |
| ------------------- | ------------------------------- |
| Instruction/content | Required                        |
| Choice              | Required                        |
| Short response      | Required where mission needs it |
| Branching           | Required where mission needs it |
| Conditional reveal  | Required where mission needs it |
| Physical handoff    | Required                        |
| Resource access     | Required                        |
| Mission Control     | Required where mission needs it |
| Completion          | Required                        |
| State persistence   | Required                        |

This is the foundation for future missions.

---

# **17\. Mission Configuration**

The product should distinguish between:

### **Mission definition**

What the mission contains.

and:

### **Learner state**

What a specific child has done.

For example:

Mission  
├── title  
├── Lab  
├── age range  
├── duration  
├── resources  
├── parent note  
├── screens  
├── choices  
├── branches  
├── reveals  
└── completion rules

while learner state contains:

Child \+ Mission  
├── access  
├── status  
├── current position  
├── completed steps  
├── choices  
├── responses  
├── revealed content  
└── evidence

This separation is central to keeping the platform extensible without making the MVP unnecessarily complicated.

---

# **18\. Mission Progress**

The system must persist mission progress.

At minimum it needs to know:

- child;
- mission;
- access;
- status;
- current position;
- completion state.

Where required by an individual mission, it must additionally persist:

- choices;
- branches;
- revealed information;
- responses;
- relevant Mission Control state;
- evidence.

The architecture explicitly states that mission-specific state is determined by the individual Build Brief rather than forcing every mission into one internal sequence.

---

# **19\. Pause & Resume**

Pause/resume is an MVP requirement.

A child may leave:

- for physical activity;
- for a break;
- later that day;
- another day.

When returning, the child must be able to continue from the appropriate state.

The system must preserve:

- status;
- completed digital actions;
- established branches;
- revealed information;
- saved responses;
- relevant mission state.

A mission must not depend on a browser tab remaining open.

---

# **20\. Physical Handoffs**

For hybrid missions, the Academy must clearly communicate:

1. **Where do I go?**
2. **What do I do?**
3. **When do I come back?**

The Academy should not duplicate physical activities unnecessarily.

The intended principle is:

> **Use technology for orchestration. Preserve physical interaction for thinking, doing and evidence.**

---

# **21\. Mission Control**

Mission Control is an optional reusable support mechanism.

It should only appear where specified by the mission.

It must:

- open without advancing the mission;
- preserve current state;
- close back to the same point;
- show only approved support;
- avoid revealing concealed information;
- avoid solving the mission.

Mission-specific support content comes from the Mission Build Brief.

---

# **22\. Mission Completion**

When approved completion conditions are satisfied:

1. mission status becomes **Complete**;
2. completion state is shown;
3. Mission Home remains accessible;
4. Mission Kit remains accessible;
5. relevant Mission Trail information is surfaced;
6. child can return to My Missions.

Primary return:

**Back to My Missions**

Completion should not trigger an upsell.

---

# **23\. Mission Trail**

Mission Trail is the child's private record of selected evidence.

It is **not** a public profile.

It can contain:

### **Physical evidence**

Evidence that exists physically but is not uploaded.

### **Digital evidence**

Responses or artefacts actually stored by the Academy.

The Academy must not imply that a physical artefact has been digitally stored when it has not.

---

# **24\. Evidence Storage**

Where an individual mission requires digital evidence:

The system should support:

- upload;
- storage;
- association with child;
- association with mission;
- retrieval;
- private access.

The MVP should **not require evidence uploads for every mission**.

The Mission Build Brief determines whether evidence is digital, physical or both.

---

# **25\. Mission Board**

Mission Board is a secondary Academy destination.

For MVP, keep this extremely limited.

The architecture only establishes that it provides access to selected, anonymised WLA practice and that it should not introduce rankings or comparison scores.

### **MVP requirement**

If Mission Board is included in the initial build, implement only the **approved viewing experience**.

Do not build:

- submissions;
- moderation;
- comments;
- likes;
- rankings;
- profiles;
- social interactions.

Submission/moderation is explicitly deferred.

If the client has not yet approved sufficient content/behaviour for the viewing experience, it is reasonable to leave Mission Board out of the first development slice rather than inventing functionality.

---

# **26\. Responsive Requirements**

The Academy must work on:

- smartphone portrait;
- tablet portrait;
- tablet landscape.

The core experience must not depend on desktop.

Requirements include:

- readable content;
- comfortable touch targets;
- no required horizontal scrolling;
- no hover-dependent core interaction;
- state not communicated through colour alone.

These are explicit Academy Architecture requirements.

---

# **27\. Privacy & Permissions**

The system must enforce the distinction between:

**Parent account**

and

**Child learning record.**

A child should only be able to access their own:

- mission progress;
- responses;
- evidence;
- Mission Trail.

A child should not be able to access another child's data.

Parent/guardian permissions should control applicable account-level and sharing functionality.

---

# **28\. Content Management**

The system should allow the client to edit reasonable post-launch content.

At minimum, this includes:

- mission catalogue information;
- Mission Detail information;
- Journal articles;
- Journal categories;
- other agreed editable fields.

The implementation should avoid building a complicated CMS for content that does not need frequent editing.

---

# **29\. Payment**

The public website supports standalone mission purchases.

The MVP must connect successful purchase/unlock events to the Academy entitlement system.

The expected relationship is:

Mission Detail  
↓  
Purchase  
↓  
Successful transaction  
↓  
Mission entitlement  
↓  
Assign to child  
↓  
My Missions  
↓  
Mission Home

The exact payment provider and checkout implementation should follow the approved technical/commercial decision rather than being assumed in this PRD.

---

# **30\. Free Mission**

The MVP must support the approved **Try a Free Mission** route.

The result should ultimately provide the eligible user with access to the free mission through the same Academy architecture:

**Try Free Mission → Access → My Missions → Mission Home → Active Mission**

The free mission should use the same underlying mission system as paid missions wherever practical.

---

# **31\. Gift Mission**

The public website includes:

**Buy a Gift**

and

**Redeem a Gift**

The MVP should support the approved gift mechanism sufficiently to result in mission access for the intended child/family.

However, the detailed gift UX should not be invented beyond the approved requirements.

---

# **32\. Analytics**

MVP analytics should focus on useful product behaviour.

Required events include:

- mission started;
- mission completed;
- mission drop-off.

Where useful, the implementation may additionally record key mission-state transitions.

Do not build an extensive behavioural analytics system merely because the infrastructure makes it possible.

---

# **33\. Error Logging**

The production system should provide basic application error logging and monitoring.

Priority should be given to errors affecting:

- authentication;
- mission access;
- mission state;
- progress persistence;
- evidence storage;
- mission completion.

---

# **34\. Backup & Versioning**

The MVP requires a reliable approach to:

- database backup;
- mission content/versioning;
- important configuration;
- uploaded assets/evidence.

The implementation should avoid unnecessary infrastructure complexity while still protecting mission state and production content.

---

# **35\. High-Level User Journeys**

## **Journey A — Existing child starts a mission**

Login  
↓  
Select child  
↓  
My Missions  
↓  
Open Mission  
↓  
Mission Home  
↓  
Start Mission  
↓  
Preparation (if required)  
↓  
Active Mission  
↓  
Complete  
↓  
Mission Complete  
↓  
Mission Trail  
↓  
My Missions
---

## **Journey B — Returning child**

Login  
↓  
Select child  
↓  
My Missions  
↓  
Continue  
↓  
Mission Home  
↓  
Continue Mission  
↓  
Resume at appropriate state
---

## **Journey C — Physical mission**

Mission Home  
↓  
Start Mission  
↓  
Preparation  
↓  
Open Mission Kit  
↓  
Physical activity  
↓  
Return to Academy  
↓  
Continue  
↓  
Next mission step
---

## **Journey D — Multiple children**

Parent Account  
↓  
Select Child A  
↓  
My Missions  
↓  
Child A progress

Switch:

Select Child B  
↓  
My Missions  
↓  
Child B progress

No cross-child mission state should appear.

---

# **36\. Core Functional Requirements**

For implementation tracking, I would reduce the entire PRD to these core requirements:

| ID            | Requirement                                        | Priority |
| ------------- | -------------------------------------------------- | -------- |
| AUTH-01       | User can authenticate                              | Must     |
| AUTH-02       | Parent owns account                                | Must     |
| CHILD-01      | Parent can have child profiles                     | Must     |
| CHILD-02      | Active child can be selected/switched              | Must     |
| ACCESS-01     | Mission entitlement can be associated with child   | Must     |
| MISS-01       | Accessible missions appear in My Missions          | Must     |
| MISS-02       | Mission status persists                            | Must     |
| MISS-03       | Mission Home exists for every accessible mission   | Must     |
| MISS-04       | Mission Kit is available from Mission Home         | Must     |
| MISS-05       | For Parents is available from Mission Home         | Must     |
| ENGINE-01     | Active Mission supports reusable content screens   | Must     |
| ENGINE-02     | System supports choices                            | Must     |
| ENGINE-03     | System supports branching                          | Must     |
| ENGINE-04     | System supports conditional reveals                | Must     |
| ENGINE-05     | System supports responses where required           | Must     |
| ENGINE-06     | System supports physical handoffs                  | Must     |
| STATE-01      | Mission state persists                             | Must     |
| STATE-02      | Child can leave and resume                         | Must     |
| STATE-03      | Reveals/branches/responses persist where required  | Must     |
| CONTROL-01    | Mission Control can be invoked where configured    | Must     |
| COMPLETE-01   | Mission can reach Complete state                   | Must     |
| TRAIL-01      | Mission Trail can hold selected evidence           | Must     |
| PRIV-01       | Child data is isolated                             | Must     |
| RESPONSIVE-01 | Academy works on mobile/tablet                     | Must     |
| CMS-01        | Approved editable content can be managed           | Must     |
| PAY-01        | Successful purchase creates/accesses entitlement   | Must     |
| ANALYTICS-01  | Mission starts/completions/drop-off are measurable | Should   |
| OPS-01        | Errors are logged                                  | Must     |
| OPS-02        | Data/content has backup/versioning                 | Must     |

---

# **37\. MVP Definition of Done**

I would consider the Academy MVP functionally ready when a real family can successfully perform this complete journey:

> **Create/access account → select child → access mission → see mission in My Missions → open Mission Home → access resources → start mission → perform required digital/physical interactions → leave → return → resume correctly → complete mission → see relevant evidence → return to My Missions.**

And technically:

- progress persists;
- child data is isolated;
- entitlements work;
- mission state survives session interruption;
- resources remain available;
- completed missions remain accessible;
- responsive behaviour works;
- basic errors are handled;
- future missions can reuse the mission engine.

---

# **38\. Recommended MVP Development Structure**

I would keep the actual development sequence very disciplined:

### **Phase 1 — Foundation**

Design system \+ application shell.

### **Phase 2 — Authentication & Child Profiles**

Account, session and child ownership.

### **Phase 3 — My Missions**

Mission collection \+ status.

### **Phase 4 — Mission Home**

Start/Continue \+ Mission Kit \+ For Parents.

### **Phase 5 — Mission Engine**

Reusable mission components.

### **Phase 6 — Persistence**

Mission state \+ resume.

### **Phase 7 — Mission Completion \+ Trail**

Completion and evidence.

### **Phase 8 — Commerce Integration**

Purchase → entitlement → mission access.

### **Phase 9 — First Mission**

Implement the first approved Mission Build Brief using the reusable engine.

### **Phase 10 — QA**

Permissions, state, responsive behaviour and real-user flows.

This order matters because **the first mission should validate the mission engine rather than become a custom-coded exception to it.**

---

# **39\. The MVP Boundary in One Sentence**

If I had to give Claude, Cursor, the developer and the client **one sentence** to keep the scope under control, it would be:

> **Build a secure, reusable mission-delivery system that lets a child access, perform, pause, resume and complete WLA missions, while keeping the meaningful work outside the interface wherever possible.**

Everything in the MVP should justify itself against that sentence.

The locked Academy Architecture supports this approach: My Missions is the collection/status layer, Mission Home is the permanent home for a mission, Mission Kit contains WLA-supplied resources, For Parents contains adult guidance, Active Mission is the doing environment, and Mission Trail is the child's private evidence record.

---

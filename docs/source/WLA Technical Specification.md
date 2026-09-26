Yes. The next document should be the **WLA Academy Technical Specification**. I would keep it tightly coupled to the PRD and the locked architecture, so that it can serve as the working technical blueprint for you, the developer, Claude and Cursor.

# **Within Lab Academy**

# **MVP Technical Specification & Architecture**

**Status:** Production MVP  
**Product:** Within Lab Academy  
**Backend:** Supabase  
**Frontend:** Existing WLA web application / Academy application  
**Hosting direction:** Vercel \+ Cloudflare \+ Supabase  
**Development:** Cursor \+ Claude  
**Primary objective:** Build a reusable mission-delivery system without over-engineering the MVP.

The Academy Architecture is the governing authority for the shared learner environment, while individual Mission Build Briefs define mission-specific screens, branches, responses, handoffs and completion behaviour.

---

# **1\. Technical Objective**

The system should allow WLA to create and deliver missions without rebuilding the Academy for every new mission.

The technical objective is therefore:

> **Build the Academy capability once; configure individual missions within it.**

The system must support:

Parent Account  
↓  
Child Profile  
↓  
Mission Entitlement  
↓  
My Missions  
↓  
Mission Home  
↓  
Active Mission  
↓  
Mission Completion  
↓  
Mission Trail

The architecture must preserve the distinction between:

- account;
- child;
- mission;
- entitlement;
- mission definition;
- mission state;
- evidence.

---

# **2\. Technical Architecture**

The current recommended production direction is:

Cloudflare  
│  
▼  
Vercel  
│  
▼  
WLA Web Application  
│  
├── Public Website  
│  
├── Authentication  
│  
├── My Missions  
│  
└── WLA Academy  
│  
▼  
Supabase  
│  
├── Auth  
├── PostgreSQL  
├── Storage  
└── Row Level Security

The handover specifically identifies **Cloudflare → Vercel → Supabase** as the recommended production direction and says Lovable should not become an unnecessary permanent production dependency.

---

# **3\. What Lovable Is and Is Not**

### **Public website**

Existing Lovable code may be:

- retained;
- reused;
- refactored;
- connected to the production backend.

The developer does not need to rebuild working public-site functionality simply because the production environment is changing.

### **Academy**

The retired Lovable Academy should **not** be used as the production architecture.

The Academy should be implemented from:

1. locked Academy Architecture;
2. approved design;
3. individual Mission Build Briefs;
4. production mission assets.

This distinction is explicitly established in the handover.

---

# **4\. Application Boundaries**

The application should conceptually contain four areas.

## **A. Public Website**

/  
/missions  
/missions/:slug  
/labs  
/journal  
/about

Existing public-site routes should be preserved according to the Website Master rather than redesigned through this technical specification.

---

## **B. Functional Public Routes**

Examples:

/try-free  
/my-missions  
/reviews  
/gift  
/redeem

Exact paths can follow the existing application conventions.

---

## **C. Academy**

Conceptually:

/academy  
/academy/missions  
/academy/missions/:missionId  
/academy/missions/:missionId/active  
/academy/missions/:missionId/complete  
/academy/missions/:missionId/trail

The exact URL structure is a technical implementation decision.

The product behaviour is what matters.

---

## **D. Account**

Conceptually:

/login  
/signup  
/forgot-password  
/account  
/children

The exact route structure should remain simple.

---

# **5\. Authentication Architecture**

Supabase Auth should manage authentication.

The application should **not** create its own password/authentication system.

At minimum:

User  
└── Parent Account  
├── Child Profile A  
├── Child Profile B  
└── Child Profile C

The authenticated Supabase user represents the parent/guardian account.

Child profiles are application-level entities associated with that account.

---

# **6\. Parent Account Model**

A parent account should contain only information needed to operate WLA.

Conceptually:

users  
│  
└── profile

Possible fields:

id  
email  
name  
created\_at  
updated\_at

Do not collect additional personal information simply because the database could accommodate it.

---

# **7\. Child Profile Model**

Conceptually:

child\_profiles

id  
parent\_id  
display\_name  
date\_of\_birth / age information if genuinely required  
created\_at  
updated\_at

The exact child information should be kept minimal.

The source documents explicitly emphasise avoiding unnecessary sensitive child information. The public master states that WLA does not require faces, public full names, school names, identifiable home information or unnecessary sensitive personal information.

---

# **8\. Active Child**

The frontend should maintain the currently selected child profile.

For example:

activeChildId

This can be session/application state rather than permanently storing an "active child" field in the database.

When the child changes:

activeChildId  
↓  
reload My Missions  
↓  
show only missions belonging to child

The server must still validate access.

**Never rely solely on frontend state to enforce child separation.**

---

# **9\. Mission Data Model**

A mission is a reusable product definition.

Conceptually:

missions

id  
slug  
title  
description  
lab  
min\_age  
max\_age  
duration  
delivery\_type  
status  
cover\_image  
price  
created\_at  
updated\_at

Additional fields can be added where required by the approved mission catalogue.

The important point is that this represents **the mission itself**, not what an individual child has done.

---

# **10\. Mission Entitlements**

Create a separate relationship between:

**Child → Mission**

Conceptually:

mission\_entitlements

id  
child\_id  
mission\_id  
source  
status  
purchased\_at  
created\_at

Possible `source` values:

purchase  
free  
gift  
redeemed  
admin/unlock

This is illustrative, not a requirement that these exact enum values must be used.

The critical requirement is that the system can answer:

> Does this child have access to this mission?

The architecture explicitly requires mission access to be associated with the intended child before child-specific progress begins.

---

# **11\. Mission Progress**

Progress should be a separate entity.

Conceptually:

mission\_progress

id  
child\_id  
mission\_id  
status  
current\_screen\_id  
started\_at  
completed\_at  
last\_activity\_at  
created\_at  
updated\_at

Where:

status \=  
not\_started  
in\_progress  
complete

This directly reflects the locked Academy status model:

- Not Started;
- In Progress;
- Complete.

---

# **12\. Mission State**

Mission progress alone is insufficient.

Some missions require additional state.

For example:

mission\_state

progress\_id  
state\_data  
updated\_at

`state_data` can contain mission-specific information such as:

{  
"selectedChoice": "option\_b",  
"revealedInformation": \["reveal\_02"\],  
"completedScreens": \["screen\_01", "screen\_02"\],  
"responseValues": {  
"response\_01": "..."  
}  
}

### **Important**

Do **not** create a giant universal schema containing every possible mission state.

The Academy Architecture specifically says mission-specific state is defined by the individual Mission Build Brief and that the shared architecture should not force every mission into the same internal sequence.

A flexible JSON/state field is therefore appropriate for MVP, provided it is validated and controlled by the mission engine.

---

# **13\. Why This Is Better for the MVP**

Instead of creating dozens of tables such as:

mission\_choices  
mission\_reveals  
mission\_branches  
mission\_screen\_responses  
mission\_handoffs  
mission\_decisions  
...

for every possible future requirement, use:

mission  
mission\_progress  
mission\_state

and allow the mission definition to describe its own state requirements.

This keeps the MVP relatively simple while retaining extensibility.

---

# **14\. Mission Definition**

A mission should consist of reusable components.

Conceptually:

Mission  
│  
├── Metadata  
│  
├── Mission Kit  
│  
├── Parent Note  
│  
└── Screens  
│  
├── Content  
├── Choice  
├── Response  
├── Reveal  
├── Branch  
├── Physical Handoff  
└── Completion

The exact schema should be designed so that Claude can render the components dynamically.

---

# **15\. Mission Screen Model**

A simple conceptual structure:

mission\_screens

id  
mission\_id  
screen\_key  
screen\_type  
title  
content  
sequence  
configuration  
created\_at  
updated\_at

Where:

screen\_type

could represent:

content  
choice  
response  
handoff  
reveal  
completion

The exact implementation may differ.

The important requirement is that **screen type determines which reusable UI component renders it.**

---

# **16\. Screen Configuration**

A screen's `configuration` can contain the data required by that component.

For example:

{  
"options": \[  
{  
"id": "a",  
"label": "Option A",  
"next": "screen\_04"  
},  
{  
"id": "b",  
"label": "Option B",  
"next": "screen\_05"  
}  
\]  
}

This allows branching to be configured rather than custom-coded.

---

# **17\. Mission Engine**

The frontend should have one reusable mission renderer.

Conceptually:

MissionRenderer  
↓  
get current mission screen  
↓  
identify screen type  
↓  
render component  
↓  
capture interaction  
↓  
update mission state  
↓  
determine next state  
↓  
persist

For example:

screen\_type \= "choice"

        ↓

ChoiceScreen

        ↓

child selects option

        ↓

save response

        ↓

evaluate branch

        ↓

next screen
---

# **18\. Do Not Build a Generic Workflow Builder**

This is an important MVP boundary.

We are **not** building:

> "A no-code mission builder for WLA administrators."

The requirement is simply:

> Future missions should not require the developer to custom-code the entire experience.

Mission definitions can initially be managed through the database/configuration or an appropriately simple content-management mechanism.

A full visual drag-and-drop mission builder is unnecessary for MVP.

---

# **19\. Mission Kit Data Model**

Mission resources belong to their mission.

Conceptually:

mission\_resources

id  
mission\_id  
title  
description  
resource\_type  
file\_path  
sort\_order  
created\_at  
updated\_at

Possible resource types:

pdf  
image  
document  
other

Again, keep this extensible but simple.

Resources may be:

- viewed;
- printed;
- downloaded.

Opening/downloading a resource must not modify mission progress.

---

# **20\. Storage Architecture**

Supabase Storage should be used for private mission-related files where appropriate.

Conceptually:

Storage  
│  
├── mission-resources/  
│  
└── mission-evidence/

These should not be treated identically.

### **Mission resources**

WLA-provided assets.

### **Mission evidence**

Child-generated private material.

Evidence requires significantly stricter access control.

---

# **21\. Mission Note for Parents**

Each mission can have one parent note.

Conceptually:

mission\_parent\_notes

id  
mission\_id  
content  
updated\_at

It belongs to the mission rather than the child.

The parent note remains available before, during and after completion.

---

# **22\. Mission Evidence**

Conceptually:

mission\_evidence

id  
child\_id  
mission\_id  
progress\_id  
evidence\_type  
title  
description  
storage\_path  
created\_at

Possible evidence types:

physical  
digital

### **Physical**

The Academy records the existence/description of evidence but does not store the physical item.

### **Digital**

The Academy actually stores the associated digital file/response.

This distinction is important because Mission Trail is the child's evidence record, not a generic file repository.

---

# **23\. Mission Trail**

The Mission Trail should query evidence belonging to:

active child  
\+  
mission(s)

It should never expose another child's evidence.

For MVP, keep the Trail simple.

It does **not** need:

- sophisticated filtering;
- search;
- social sharing;
- public profiles;
- reactions;
- comments.

---

# **24\. Row Level Security**

This is one of the most important technical requirements.

Frontend route protection is **not enough**.

Supabase Row Level Security should ensure that users can only access authorised records.

Conceptually:

### **Parent**

Can access:

- own account;
- own child profiles;
- missions entitled to own children;
- relevant parent resources;
- applicable child evidence according to the approved permission model.

### **Child context**

Can access:

- selected child's missions;
- selected child's progress;
- selected child's responses;
- selected child's evidence.

### **No cross-child access**

Child A must never be able to retrieve:

Child B progress  
Child B responses  
Child B evidence

through a manipulated request.

---

# **25\. Server-Side Validation**

Every sensitive Academy operation should validate:

authenticated user  
↓  
owns child profile?  
↓  
child has mission entitlement?  
↓  
resource belongs to mission?  
↓  
perform operation

Do not trust:

- child IDs supplied by the browser;
- mission IDs alone;
- hidden form fields;
- frontend route restrictions.

---

# **26\. Mission Access Flow**

A user attempts:

/academy/missions/mars

The application should:

1. confirm authenticated session;
2. determine active child;
3. confirm active child belongs to authenticated parent;
4. confirm child has entitlement;
5. load mission;
6. load progress;
7. load mission state;
8. render Mission Home.

If entitlement fails:

**Do not render the mission experience.**

Return the user to an appropriate access/mission state.

---

# **27\. Mission Start**

When the user selects:

**Start Mission**

the system should:

1. verify entitlement;
2. retrieve/create mission progress;
3. set status to `in_progress`;
4. establish the initial mission state;
5. record the current position;
6. open Active Mission.

Do not create duplicate progress records every time Start is clicked.

---

# **28\. Mission Resume**

When selecting:

**Continue Mission**

the system should:

1. retrieve existing progress;
2. retrieve saved state;
3. identify current screen/state;
4. render the appropriate mission screen;
5. continue from that point.

The architecture explicitly requires returning users to the appropriate state and preserving branches, reveals and responses.

---

# **29\. State Persistence Strategy**

For MVP, save state at meaningful interaction points.

Examples:

- choice confirmed;
- response submitted;
- reveal unlocked;
- branch established;
- physical handoff confirmed;
- screen/state transition.

Do not rely on:

localStorage only

for authoritative mission state.

Local storage may optionally be used as a temporary UX aid, but Supabase should hold the authoritative state.

---

# **30\. Handling Interrupted Sessions**

If a child:

- closes the browser;
- loses internet;
- leaves the page;
- returns another day;

the server-side state should remain intact.

When they return:

Login  
↓  
Select child  
↓  
My Missions  
↓  
Continue  
↓  
Restore mission state

This is a core MVP requirement, not an enhancement.

---

# **31\. Mission Completion Logic**

Completion should be determined by the mission configuration.

For example:

completion:  
type: "screen\_reached"  
target: "completion\_screen"

or:

completion:  
type: "condition"  
conditions:  
\- response\_01 \!= null  
\- choice\_03 \= "option\_b"

Do not hard-code:

if missionId \=== "mars"

into the application.

That would undermine the reusable mission architecture.

---

# **32\. Completion Transaction**

When completion conditions are satisfied:

mission\_state updated  
↓  
mission\_progress.status \= complete  
↓  
completed\_at \= timestamp  
↓  
completion screen

This should happen reliably and ideally atomically where multiple database writes are involved.

The child should not see "Complete" in the interface while the backend still considers the mission incomplete.

---

# **33\. Mission Control Architecture**

Mission Control should be a reusable component.

Conceptually:

Active Mission  
│  
└── MissionControl  
│  
├── Open  
├── Display approved support  
└── Close

It must not advance mission state.

It should use the current mission/screen context to determine what support is available.

---

# **34\. Physical Handoff Architecture**

A handoff should be represented as a mission screen/component rather than hard-coded into the shell.

Example:

{  
"type": "physical\_handoff",  
"title": "Now try it yourself",  
"instructions": "...",  
"return\_instruction": "...",  
"requires\_confirmation": true  
}

The actual content belongs to the Mission Build Brief.

---

# **35\. Navigation Rules**

The Academy should maintain clear navigation between:

My Missions  
↕  
Mission Home  
↕  
Active Mission  
↕  
Mission Kit  
↕  
Mission Control

Leaving Active Mission for Mission Home or Mission Kit must not destroy progress.

Returning to the mission should use:

**Continue Mission**

and restore the appropriate state.

This behaviour is explicitly locked in the architecture.

---

# **36\. Recommended Frontend Component Architecture**

The exact framework structure should follow the existing WLA codebase, but conceptually:

src/  
│  
├── components/  
│ ├── ui/  
│ ├── navigation/  
│ ├── mission/  
│ ├── profile/  
│ └── academy/  
│  
├── pages/  
│ ├── public/  
│ ├── auth/  
│ └── academy/  
│  
├── features/  
│ ├── auth/  
│ ├── children/  
│ ├── missions/  
│ ├── mission-engine/  
│ ├── mission-trail/  
│ └── entitlements/  
│  
├── lib/  
│ ├── supabase/  
│ ├── permissions/  
│ └── analytics/  
│  
└── types/

This is a **recommended organisation**, not a requirement to restructure an existing application unnecessarily.

---

# **37\. Mission Engine Component Structure**

Conceptually:

MissionRenderer  
│  
├── ContentScreen  
├── ChoiceScreen  
├── ResponseScreen  
├── RevealScreen  
├── PhysicalHandoffScreen  
├── MissionControl  
└── CompletionScreen

Shared components should be genuinely reusable.

The Designer Brief specifically calls for a shared component/state language across design and development.

---

# **38\. Public Website Integration**

Do not duplicate mission information unnecessarily.

Where practical:

Public Mission  
│  
└── mission\_id  
↓  
Academy

The same mission record can provide:

- catalogue information;
- Mission Detail information;
- Academy identity.

However, public marketing content and learner mission content should remain conceptually separate.

---

# **39\. Editable Content**

The MVP needs a practical content-management mechanism.

The documents require editable:

- Journal articles;
- Journal categories;
- mission catalogue information;
- Mission Detail information;
- agreed editable fields.

However:

> **Do not build a full custom CMS unless the existing platform requires it.**

The simplest suitable mechanism should be selected.

For example, if the existing application already has an appropriate database/content structure, use it.

Do not introduce another external CMS merely to satisfy the idea of "content management."

---

# **40\. Payments**

The technical implementation should expose a clean entitlement boundary:

Payment Provider  
↓  
Successful Payment  
↓  
Verified Server Event  
↓  
Mission Entitlement  
↓  
Child Assignment  
↓  
My Missions

The Academy should **not trust a frontend success message** as proof of payment.

The actual payment provider webhook/server verification should determine whether an entitlement is created.

The specific provider is not defined in the supplied architecture documents, so it should be confirmed before implementation rather than assumed.

---

# **41\. Gift Architecture**

The same entitlement model should ultimately support gifts.

Conceptually:

Gift Purchase  
↓  
Gift Record  
↓  
Redeem  
↓  
Child Assignment  
↓  
Mission Entitlement

Do not create a completely separate mission-access architecture for gifts.

---

# **42\. Analytics**

Keep MVP analytics intentionally small.

Required events:

mission\_started  
mission\_completed  
mission\_drop\_off

Useful contextual properties could include:

mission\_id  
child/anonymous internal identifier as appropriate  
timestamp  
screen\_id where relevant

Avoid collecting unnecessary child information in analytics.

---

# **43\. Error Handling**

Every major operation should have a recoverable failure path.

Examples:

### **Mission loading**

> We couldn't load this mission. Try again.

### **Saving response**

> Your response couldn't be saved. Try again.

### **Evidence upload**

> Upload failed. Try again.

### **Resource unavailable**

> This resource isn't available right now.

### **Session expired**

Return the user to authentication without losing server-side progress.

---

# **44\. Loading States**

The developer should implement the states supplied by the design rather than inventing them.

At minimum:

- authentication loading;
- child/profile loading;
- My Missions loading;
- Mission Home loading;
- Active Mission loading;
- resource loading;
- evidence upload progress.

The Designer Brief specifically requires loading, empty, error, unavailable and interrupted/restoring states where relevant.

---

# **45\. Responsive Technical Requirements**

The application should not contain functionality that only works through:

:hover

Core interactions must work through touch.

The target devices include:

- smartphone portrait;
- tablet portrait;
- tablet landscape.

The Academy Architecture explicitly states that core behaviour should not depend on desktop use.

---

# **46\. Accessibility Technical Requirements**

The implementation should support:

- semantic HTML;
- keyboard navigation;
- visible focus;
- accessible form labels;
- appropriate ARIA where necessary;
- readable contrast;
- touch-friendly controls;
- reduced-motion preferences;
- screen-reader-friendly state changes.

Do not rely on colour alone for:

- mission status;
- selected options;
- errors;
- completion.

---

# **47\. Security Requirements**

Minimum MVP security requirements:

### **Authentication**

Supabase Auth.

### **Authorisation**

RLS \+ server-side validation.

### **Storage**

Private buckets for child evidence.

### **Database**

Child-specific access controls.

### **Files**

Do not expose permanent public URLs for private child evidence.

### **Secrets**

No Supabase service-role keys in frontend code.

### **Payments**

Validate payment server-side/webhook.

### **Input**

Validate and sanitise user-generated responses where appropriate.

---

# **48\. Data Relationships**

The simplified relationship model is:

PARENT  
│  
├──────────────┐  
↓ ↓  
CHILD CHILD  
│ │  
↓ ↓  
ENTITLEMENT ENTITLEMENT  
│ │  
↓ ↓  
MISSION MISSION  
│ │  
↓ ↓  
PROGRESS PROGRESS  
│  
├── STATE  
├── RESPONSES  
└── EVIDENCE

And separately:

MISSION  
├── RESOURCES  
├── PARENT NOTE  
└── MISSION DEFINITION
---

# **49\. Recommended Database Relationship**

A simplified relational model:

auth.users  
│  
│ 1:N  
▼  
profiles  
│  
│ 1:N  
▼  
child\_profiles  
│  
│ 1:N  
▼  
mission\_entitlements  
│  
│ N:1  
▼  
missions  
│  
├── mission\_resources  
│  
├── mission\_parent\_notes  
│  
└── mission\_screens

Then:

child\_profiles  
│  
└── mission\_progress  
│  
├── mission\_state  
├── mission\_responses  
└── mission\_evidence

This is sufficiently structured for MVP without becoming unnecessarily elaborate.

---

# **50\. Important Data Rule**

Never make:

parent\_id \+ mission\_id

the primary basis for learner progress.

It must be:

child\_id \+ mission\_id

because the architecture explicitly defines the **child profile** as the owner of mission progress and learning record.

---

# **51\. Mission State Machine**

The shared Academy status model is:

NOT STARTED  
│  
│ Start  
▼  
IN PROGRESS  
│  
│ Completion conditions met  
▼  
COMPLETE

There should not be an automatic:

COMPLETE → NOT STARTED

transition.

Mission replay is explicitly deferred.

---

# **52\. Mission State vs UI State**

Keep these separate.

### **Server mission state**

Persistent:

- current screen;
- choices;
- responses;
- branches;
- reveals;
- completion.

### **UI state**

Temporary:

- modal open;
- loading spinner;
- selected tab;
- menu open;
- local animation state.

Do not save every UI state to Supabase.

---

# **53\. Mission Content Versioning**

There is an important future concern:

A child may begin Mission A.

Later, WLA updates Mission A.

The system should avoid silently breaking the child's existing state.

For MVP, the simplest approach is to support a basic mission version identifier:

mission\_version

Progress can reference the version against which it was started.

This should remain simple unless actual launch requirements demand more sophisticated version management.

---

# **54\. What Claude Should Not Do**

When working in Cursor, Claude should **not**:

- redesign the product;
- invent new Academy sections;
- add gamification;
- add notifications;
- add search;
- add filtering;
- add mission replay;
- create social functionality;
- create a parent dashboard;
- redesign the public site unnecessarily;
- use the retired Lovable Academy as reference;
- create separate custom architecture for each mission;
- store sensitive child information unnecessarily;
- bypass RLS with frontend assumptions.

---

# **55\. Claude's Implementation Priority**

Claude should follow this order:

1\. Existing application architecture  
2\. Locked WLA Academy Architecture  
3\. Approved PRD  
4\. Approved technical specification  
5\. Approved design  
6\. Individual Mission Build Brief  
7\. Developer judgement

When requirements conflict:

> **Stop and flag the conflict.**

Do not silently resolve a product conflict through code.

This follows the Designer Brief's authority hierarchy, which says conflicts between authorities should be flagged rather than solved through visual redesign.

---

# **56\. Development Sequence**

I would give Claude/Cursor this implementation order.

## **Sprint 1 — Inspect Existing Application**

Before changing anything:

- inspect repository;
- identify framework;
- identify existing routes;
- inspect existing Lovable components;
- identify Supabase setup;
- identify existing database schema;
- identify existing authentication;
- identify reusable components.

**Do not start coding until this audit is complete.**

---

## **Sprint 2 — Supabase Foundation**

Implement/verify:

- Auth;
- profiles;
- child profiles;
- missions;
- entitlements;
- RLS.

---

## **Sprint 3 — My Missions**

Implement:

- active child;
- mission collection;
- statuses;
- cards;
- empty/loading/error states.

---

## **Sprint 4 — Mission Home**

Implement:

- mission metadata;
- Start/Continue;
- Mission Kit;
- For Parents;
- completed state.

---

## **Sprint 5 — Mission Engine**

Implement:

- content;
- choices;
- responses;
- branches;
- reveals;
- physical handoffs;
- Mission Control;
- completion.

---

## **Sprint 6 — Persistence**

Implement:

- mission progress;
- mission state;
- resume;
- response persistence;
- branch/reveal persistence.

---

## **Sprint 7 — Mission Trail**

Implement:

- evidence records;
- private storage;
- physical/digital distinction;
- Trail display.

---

## **Sprint 8 — Commerce**

Connect:

- purchase;
- payment verification;
- entitlement;
- child assignment;
- My Missions.

---

## **Sprint 9 — First Mission**

Implement the first approved mission using the engine.

---

## **Sprint 10 — QA**

Test the complete system.

---

# **57\. QA Test Matrix**

The developer should test at least:

### **Authentication**

- new account;
- existing account;
- invalid credentials;
- logout;
- session restoration.

### **Children**

- one child;
- multiple children;
- switch child;
- verify separate mission collections.

### **Entitlements**

- entitled child;
- non-entitled child;
- purchased mission;
- free mission;
- redeemed/gift mission where applicable.

### **Mission state**

- start;
- progress;
- leave;
- return;
- refresh;
- logout;
- login again;
- resume.

### **Branching**

- branch A;
- branch B;
- refresh after branch;
- return after branch.

### **Reveals**

- hidden;
- revealed;
- refresh;
- return.

### **Completion**

- incomplete;
- complete;
- return;
- completed mission remains accessible.

### **Evidence**

- physical evidence;
- digital evidence;
- upload;
- failed upload;
- private access.

### **Security**

- attempt cross-child access;
- attempt unauthorised mission access;
- manipulate mission/child IDs;
- attempt direct storage access.

### **Responsive**

- smartphone;
- tablet portrait;
- tablet landscape;
- desktop.

---

# **58\. MVP Acceptance Test**

The most important end-to-end test is:

> Can a parent create/access an account, select a child, give that child access to a mission, have the child open it, complete part of it, leave, return later, continue from the correct state, complete it, and see the resulting evidence — without another child being able to access that data?

If the answer is yes, the core Academy product is working.

---

# **59\. What "Reusable" Means for MVP**

There is a danger of interpreting "reusable mission system" as:

> Build a huge generic learning platform.

That is **not** what I recommend.

For this MVP, reusable means only:

Same Academy shell  
\+  
Same mission renderer  
\+  
Same core interaction components  
\+  
Different mission configuration/content

For example:

Mars Bridge Builder  
↓  
Content  
Choice  
Physical Handoff  
Response  
Completion

and:

Six Names  
↓  
Content  
Choice  
Reveal  
Branch  
Response  
Completion

Both use the same underlying engine.

That is enough.

---

# **60\. MVP Technical Non-Goals**

To prevent scope creep, the following are explicitly technical non-goals:

### **No**

- custom LMS engine;
- no-code mission builder;
- complex workflow editor;
- recommendation engine;
- AI tutor;
- chat system;
- social network;
- gamification engine;
- notification platform;
- advanced analytics warehouse;
- sophisticated CMS;
- global file library;
- mission replay engine;
- advanced search;
- advanced filtering.

None is necessary to prove the WLA product model.

---

# **61\. Final Architecture**

The simplest useful version is:

                        WLA
                          │
             ┌────────────┴────────────┐
             │                         │
       PUBLIC WEBSITE              ACADEMY
             │                         │
     Discover/Choose              Authenticated
       Purchase                       │
             │                        ▼
             │                  Parent Account
             │                        │
             │                  Child Profiles
             │                        │
             │                  Entitlements
             │                        │
             │                   My Missions
             │                        │
             │                  Mission Home
             │                        │
             │                  Active Mission
             │                        │
             │                ┌───────┴────────┐
             │                │                │
             │          Mission State     Mission Kit
             │                │
             │          Completion
             │                │
             │          Mission Trail
             │
             └────── Purchase → Entitlement

And technically:

Vercel  
│  
└── WLA Application  
│  
└── Supabase  
├── Auth  
├── PostgreSQL  
├── RLS  
└── Storage
---

# **62\. The Core Technical Principle**

I would put this at the very top of the actual technical specification given to the developer:

> **Do not build WLA as a collection of custom mission pages. Build a small, reliable Academy engine that can render approved missions from reusable components and persist each child's state securely.**

That gives you the balance you asked for:

**Simple MVP \+ real product architecture \+ room for future missions.**

It also stays faithful to the source documents: the Academy is explicitly intended to be a shared platform whose individual mission briefs inherit the common behaviour rather than repeatedly redefining it.

---

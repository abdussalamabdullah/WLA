# WLA Academy — Final QA Report

Branch `academy-mvp`, code under test **`28f7f48`** (HEAD `0c404f9` is docs only). Executed 2026-10-05 against a
production build (`next build` + `next start`, port 3100) on **staging** Supabase (`zvquddwdcysgrcuvywqw`).
No application code, migration, seed or Six Names content was changed during Final QA. The only additions are
the QA scripts named below and this report.

---

## A. Verdict

# READY FOR PRODUCTION QA

No BLOCKER, HIGH or MEDIUM defect was found. Four LOW defects and the QA limitations below are recorded. None of
them affects learner safety, sibling isolation, state authority or Six Names.

---

## 1. Baseline (final commit)

| Item | Result |
| --- | --- |
| Commit / tree | `0c404f9` (code `28f7f48`). Clean except the untracked, deliberately uncommitted `docs/CURRENT-MANUAL-QA-ACCESS-PACK.md` and the new QA scripts |
| Migrations | 37 local, 37 staging, latest `20261004200000`, in parity |
| Typecheck | clean |
| Lint | 0 errors, 2 warnings (LOW-4) |
| Production build | succeeds |
| Unit / component tests | **712 / 712** in 35 files |
| Security regression (local PostgreSQL, real migrations) | **166 / 0** |
| Six Names SQL routes | **64 / 0** |

---

## B. Test totals

| Area | Script(s) | Result |
| --- | --- | --- |
| Unit | vitest | **712 / 712** |
| Security, SQL and API | local regression · staging as real roles · staging lifecycle | **166/0 · 67/0 · 54/0** |
| Security, browser | `anon` 20 · `parentB` 16 · `childkit` 7 · `child-edge` 13 · `sec-final` 24 · `revoke-final` 3 | **83 / 83** |
| Six Names | `sixnames.mjs` (fresh R5 children, 6 routes) · SQL · unit | **216/216 · 64/0 · 103/103** |
| Builder, browser | `builder-final` 28 · `forms-lifecycle` 29 · `patterns` 6 · device screens in `device-final` 2 | **65 / 65** |
| Learner, browser | `learner-final` 31 · `forms-learner` 25/26 (QA-L4) · `mechanics` 21 · `learner-library` 24 · `trail` 13 | **114 / 115** (the miss is QA-L4) |
| Accessibility | `kb-final` 13 · `a11y3` parent 23/24 (QA-L5) · admin 28 · `text200` 51/52 (QA-L5) | **115 / 117** (both misses are QA-L5, verified separately) |
| Analytics | `analytics-final` | **11 / 11** |
| Device | `device-final` 12 · `device-real` 9 | **21 / 21**, plus Hardware QA Required (§G) |
| Mission Board | `board` (permission, anonymisation, moderation, withdrawal; final build) | **21 / 21** |

---

## 2. Builder QA through the actual UI (no Advanced JSON)

`builder-final.mjs` built a new mission, `qa-final-2u3zf`, **entirely through the generated forms**. A check
asserts that no JSON field was ever opened. Every operation below was exercised successfully:

| Operation | Evidence |
| --- | --- |
| Create mission | the create form → builder v1 |
| Mission logic: variable (hidden), **variants** (2, values per variant), **QR** code (unlock action), **printable** (field with `{{var}}`, display font, max width), completion condition | the forms → "Mission logic saved."; the stored definition was confirmed in the database |
| Screens (8): content, **choice with branching options**, two branch screens, **code entry with outcomes (two accepted values), a no-match message and retry**, a **gated screen** ("Shown only when" unlocked + "Otherwise goes to"), a response screen with a **Mission Trail marker**, completion | every save returned "Screen saved." |
| Configure **Mission Control** | a support item on the intro screen, then opened by the learner |
| Configure **printables on a screen** | "Add prints" → the learner's print link → a PDF |
| Branches meet again | "Branches meet again at"; the flow map shows ◆ |
| Mission Kit resource, parent note | both forms |
| **Inspect QA results** | "Nothing is stopping this version being published"; the print checklist names the base |
| **Test branches** | "Branch test: N of N routes reach Complete" |
| QR sheet | renders a scannable code for `/q/<mission>/gate` |
| **Preview** | the print offer is shown; a decision takes its own branch |
| **Reset preview** | "Start again" returns to the first screen with fresh state |
| **Draft → Review → Publish** | v1 in review → published and locked; still out of the public catalogue |
| **Create another version** | v2 draft, edited through the screen form, published; **v1 archived, not deleted** |
| **Archive / rollback** | "Restore as new draft" on archived v1 → v3 draft with **v1's** content, not v2's |
| **Duplicate** | an unpublished copy with screens, logic and Kit |
| Media and patterns | `forms-lifecycle` (four assets through the Asset Manager; audio Mission Control, captioned video, layers) and `patterns` (prediction → recall), both re-run on the final build |
| Device screens (tilt, motion) | added through the forms to the v3 draft and played in Preview (`device-final`) |

---

## 3. Learner QA (fresh disposable children)

`learner-final.mjs` uses a **fresh child signed in by access code on a phone viewport** and the **parent following on
a laptop**:

- **Sign-in, My Missions and Mission Home.** Code sign-in works. My Missions shows Not started → Start Mission;
  Start Mission is the primary action; Mission Kit is subordinate; For Parents is withheld from the child session
  (by design).
- **The Kit does not touch progress.** The child opens a Kit file through a signed redirect. Opening the Kit and the
  For Parents route created **no progress row**, and Mission Home still said Start Mission.
- **Variant, version pin and hidden variable.** A variant was drawn and kept in **private** server state. The hidden
  variable never reached the browser HTML. The run is pinned to the published version (v2).
- **Printable.** It is made for this run, as a PDF with `no-store`.
- **Mission Control.** It opens with the authored support and does not advance the mission.
- **Branching and resume.** The north branch was taken. My Missions showed In progress → Continue Mission, and resume
  landed on the same screen.
- **Cross-device continuity.** The parent's laptop showed the same place and advanced it; the **child's phone then
  followed the server**, not its own copy.
- **Code entry and QR gate.** A wrong code got the authored message and stayed. Scanning the gate QR returned the
  child to the mission and recorded the unlock. The run's code opened the gate, and the gated screen appeared
  **because** of the scan. `kb-final` covers the opposite case: with no scan, the "otherwise" route skips it.
- **Interruption and completion.** A half-written answer survived a reload. Completion is closure: no score, badge or
  upsell. The Trail holds the child's own answer and is private. My Missions shows Complete → View Mission, and a
  completed run does not reopen for replay.
- **Sibling isolation.** A fresh sibling sees neither the mission, nor the Trail answer, nor the run.

**Also re-run on the final build:**
- `forms-learner`: pool draw stable across reload, a changing-condition event, signed audio and video with captions
  and transcript, layers, Trail relations, and analytics.
- `mechanics`: QR scan-to-reveal, a printable carrying the run's hidden code, a timer, and the compass manual route.
- `learner-library` 24/24: hotspot, numeric, code, tokens, arrange, simulation and workspace review, with no answer, route or rule in the page source. Server grading (a miss is guidance), pause/resume, a workspace board persisting across screens and reloads, an inventory variable, hidden variables kept out of family-readable state, a paper sketch storing no drawing, and analytics without free text.
- `trail` 13/13: Lab named, entries dated with when they were kept, physical entries never implying a stored copy, for parent and child at 390 and 1512.

---

## E. Six Names, all six branches (final commit)

Six **fresh** children (`QA … R5`) each played one approved route through real child sessions: **216 / 216**.

| Route | Result |
| --- | --- |
| Ask → Pause | pass |
| Ask → Share | pass |
| Ask → Away | pass |
| Stop → Pause | pass |
| Stop → Share | pass |
| Stop → Away | pass |

Every route checked:
- only the selected consequence is shown, and unused consequences never reach the page;
- the tracker after each decision;
- the Changed List;
- Evidence hidden until its stage and shown in place once opened;
- Evidence changes Clarity only;
- Mission Control is offered, reveals nothing and does not advance the mission;
- pause/resume to the exact screen and tracker;
- Judgement cards are not marked right or wrong, and the choice is recorded;
- no free-text field, and no written answer stored;
- a reload mid-sort returns to the same item;
- Final Judgement stays physical;
- completion as closure;
- the Trail shows only the child's own entries;
- no other child appears;
- the run is pinned to v2 and complete.

Staging lifecycle confirms Six Names is **unpublished and untouched**.

---

## F. Security — PASS

| Requirement | Evidence |
| --- | --- |
| Parent/child and sibling isolation | local 166/0 · staging 67/0 · sibling checks in `learner-final`, `sixnames` and `parentB` |
| Unpublished, draft and in-review access | `sec-final`: the unpublished duplicate is not found for parent, child session and public; the run stays pinned to v2 while v3 is a draft |
| Admin-only operations | `sec-final`: 7 admin surfaces (builder, preview, QR sheet, analytics, version actions, Board moderation) → 307 for both parent and child session |
| Kit entitlement, private storage, signed URLs | `childkit` 7/7 (Kit via `/api/kit/<id>` → signed 302, forged id refused, 404 after revocation) · `anon` 20/20 · printable 404 for an unentitled sibling |
| Board permissions | staging 67/0 · `board` 21/21 on the final build |
| Analytics privacy | `analytics-final`: no name, typed text, attempted code or hidden value on the page or in any stored event detail |
| Hidden variables | absent from the browser HTML (`learner-final`); kept in `mission_state_private` |
| Version pinning | `learner-final` and `sec-final` |
| Direct API/RPC attempts | staging 67/0 (real roles through PostgREST) · local 166/0 |
| Child session expiry and revocation | `child-edge` 13/13 · `revoke-final` 3/3: once revocation commits, the open child session is signed out, every round |
| Regenerated codes | `child-edge`: a new code stops the old one; the new one works; rate limiting engages by the 6th wrong try |

During QA, two probe failures turned out to be **test artefacts**, not product defects:
- A raw `fetch` of a streamed page returns 200 before `notFound()` resolves. Rendered checks confirm "not found".
- A fixed 2.5s wait was shorter than revocation's commit time, which was up to 2.7s on staging. Polling the
  database confirms immediate sign-out.

---

## 6. Accessibility (actual UI)

| Check | Result |
| --- | --- |
| **Keyboard only** (`kb-final`): Start → Mission Control (opens with focus, Escape closes and **returns focus to its button**) → choice (Space) and confirm → code (typed; a wrong code is announced via `role="status"`) → response → completion → My Missions | 13/13, **every stop showed a visible focus indicator** |
| Reduced motion (emulated `prefers-reduced-motion: reduce`) | durations collapse to 0ms; no element transitions |
| Portrait 390×844 and landscape 844×390 on the Active Mission | no horizontal scroll, ≥44px targets, accessible names, labels, one h1 |
| 200% text, and zoom-200% at 640px | `text200` 51/52 (QA-L5) |
| Breakpoints 390 / 834 / 1180 landscape / 1512, parent and admin | `a11y3` 23/24 (QA-L5) and 28/28 |
| Error messaging | code no-match is guidance in a live region; an empty answer cannot be submitted (Save disabled until there is text); a failed save keeps the child in place (D-18) |
| Alternative routes | compass, tilt and motion all have manual routes; camera scanning always has typing (`device-final`) |

---

## 8. Analytics (real disposable activity)

The activity was 11 runs of `qa-final-2u3zf`: two completions by different branches, keyboard-only play, an
abandoned run with two code misses, and a return after a gap. `analytics-final` then read `/admin/analytics/<m>`.

It confirmed:
- starts and completions;
- **Came back later** and **Finished after returning**;
- where unfinished runs stopped (by screen);
- Mission Control opens by screen and level;
- choices by option, and variants;
- validation failures and **code attempts** for the code screen;
- QR scans, Kit opens and Trail saves;
- the device class (`mobile` from the phone session).

**No child name, typed text, attempted code or hidden value** appears on the page or in stored event detail.
Fallbacks (`camera_denied`, `camera_unavailable`, `compass_unavailable`) are reported structurally (`device-final`).

**Declared test setup.** One run's `last_activity_at` was moved back 3 hours with the service role, so that a
real return gap could be measured without waiting. Nothing else was altered.

---

## C. Enhancement Plan coverage

| § | Area | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Family account and child access | **COMPLETE**, with the Family Mission Guide **BLOCKED** (OPEN-15) | code sign-in/regenerate/revoke (`child-edge`, `revoke-final`); Account (`account.mjs`, earlier); per-child missions (LOW-1) |
| 2 | My Missions, Mission Home, continuity | **COMPLETE** | `learner-final` (status pairing, cross-device, pause/resume, Kit without progress) |
| 3 | Mission logic engine | **COMPLETE** | branching, conditions with "otherwise", hidden variables, variants, events, randomisation, checkpoints and timers (`learner-final`, `kb-final`, `forms-learner`, `mechanics`) |
| 4 | Interaction library and workspace | **COMPLETE** | `learner-library` 24/24 on the final build; earlier builder-side `library` 102/0 |
| 5 | Physical ↔ digital | **COMPLETE**, with hardware items as **QA LIMITATION** (§G) | QR unlock and gating, dynamic printables, compass/tilt emulated, camera QR via fake feed, all fallbacks |
| 6 | Evidence and Mission Trail | **COMPLETE** | `trail` 13/13 and the Trail checks in `learner-final` and `sixnames` |
| 7 | Reflection and thinking | **COMPLETE** | `patterns` (prediction → recall) and Six Names Judgement |
| 8 | Mission Control and adaptive support | **COMPLETE** | opens, never advances, returns focus; multi-level support (unit) |
| 9 | Mission Board | **COMPLETE**; retention beyond withdrawal **BLOCKED** (OPEN-14) | `board` 21/21 on the final build |
| 10 | Media | **COMPLETE** | signed audio and video, captions, transcript, layers, alt text (`forms-learner`, `forms-lifecycle`) |
| 11 | Accessibility and flexible participation | **COMPLETE** | §6 |
| 12 | Authoring and production tools | **COMPLETE**; reading-level rules **BLOCKED** (OPEN-15) | §2; LOW-2 and LOW-3 are authoring-QA gaps |
| 13 | Analytics | **COMPLETE** | §8 |

---

## D. Defects

| ID | Severity | Route / feature | Reproduction | Impact | Status |
| --- | --- | --- | --- | --- | --- |
| LOW-1 | LOW | `/account` | Sign in as a parent with many child profiles and open Account. The page reads each child's missions and code status separately (several queries per child). | 85 children: 26–32s, and one load fell into "We couldn't load your account" while other QA ran. A normal family: 2.6–7.6s, against 1.7–2.9s for My Missions (with a 2.3s base round trip to staging from the test machine). Families of realistic size are served; the page scales linearly with children. | Open. Batch the per-child reads. |
| LOW-2 | LOW | Builder Mission QA | Set a completion condition that is met before the completion screen (e.g. "response wrap exists", with wrap → done). | The run completes on the condition and the authored completion screen's message is never shown. The completion page's own closure copy still appears, and QA does not warn, because completion screens are exempt from the unreachable-screen check. | Open. Add an advisory. |
| LOW-3 | LOW | Builder catalogue templates | Add a code-entry screen and leave Hint unchanged. | The template's example hint ("Use the cipher wheel from your Mission Kit.") is published to children. QA does not flag unchanged template example text. | Open. Add an advisory, or make the example a placeholder. |
| LOW-4 | LOW | Lint | `npm run lint` | 2 unused-variable warnings (`device-real.mjs:21`, `mechanics.test.ts:101`). | Open, cosmetic. |

**QA limitations** (not defects):

| ID | What |
| --- | --- |
| QA-L1 | Motion/shake: Chrome's sensor override produced **0 `devicemotion` events**, so the shake count could not be driven. Hardware QA Required. |
| QA-L2 | Device class is taken from the user agent. Headless Chrome reports desktop unless the UA is overridden (done in `analytics-final`). |
| QA-L3 | `media.mjs` needs `qa-library-mission` v1 to be a draft, and it is now published. Its coverage is superseded by `forms-lifecycle` and `forms-learner` on the final build. |
| QA-L4 | `forms-learner` "the next stage says it opens later". The checkpoint opens 25s after the storm event, and on this slower run the child arrived after it had already opened. The following checks (held at the stage, opens after the interval) passed. The wait screen itself passed in the previous 26/26 run and in `mechanics`. |
| QA-L5 | `a11y3` and `text200` audited `/account` before it finished streaming (the 85-child fixture, LOW-1), so h1 = 0. Rendered separately at 834px, three times: h1 = 1, no overflow, no small targets. The 200% text run of the same page had no overflow or clipping. |
| QA-L6 | The per-screen retry button ("Start this step again") was shown in the browser but not pressed. Its behaviour is covered by unit tests. |

**Open decisions:** OPEN-14 and OPEN-15, unchanged (§H).

---

## G. Hardware QA Required (not faked)

| Capability | Emulated / verified here | Real-device test instructions |
| --- | --- | --- |
| **Motion / shake** (`device_input` mode `motion`) | manual route only | On an iPhone (Safari) and an Android phone (Chrome), signed in as a child, open a mission screen in motion mode (the `shake` screen in Preview of `qa-final-2u3zf` v3, as admin). Tap "Count my shakes". On iOS, accept the motion permission prompt. Shake firmly 3 times: the count should read 3 and "Use this" should advance. Repeat, denying the iOS prompt: "The sensor isn't available — this way works just the same" should appear with the manual route. |
| **iOS orientation permission prompt** (compass and tilt) | not emulable | iPhone, Safari: on a compass screen (`qa-mechanics-mission` "Which way is the tower") tap "Use the compass". Accepting must start live headings. Denying must show the manual route and record `compass_denied`. |
| **Real magnetometer** | `DeviceOrientation` override verified (90° → East) | Stand facing a known compass direction. The reading should be within ±15° and in words (e.g. "East"). Rotate 90° and confirm it follows. |
| **Real tilt** | override verified (40° → 3°) | Hold the phone flat on a table: the reading should be within ±3°, and "Use this" takes the level outcome. |
| **Camera QR scanning** | a fake camera feed decoded by BarcodeDetector; denial and absence verified | Android Chrome: print the QR sheet (`/admin/builder/<m>/<v>/qr`), scan with "Scan it with the camera", and confirm it reads with no photo kept. iOS Safari has no BarcodeDetector, so confirm the "type it in instead" route appears at once. Also scan a printed QR with the phone's own camera app: it should open `/q/<mission>/<code>` and return the child to the mission. |
| **Printed output** | PDF content and fonts verified by decoding | Print the run's code card on A4 at 100%. Text should be legible, inside the margins, and match the on-screen code. |

---

## H. OPEN-14 / OPEN-15

**Untouched.** No decision was made, and no code, copy or rule was invented for either. Board retention beyond
withdrawal, parent-account deletion and Trail export (OPEN-14), and the Family Mission Guide content and Mission
Manual reading-level rules (OPEN-15), remain BLOCKED exactly as recorded in `docs/OPEN-DECISIONS.md`.

---

## I. Recommendation

**Proceed to client acceptance testing.** Final QA found no blocking, high or medium defect across the Builder,
learner, Six Names, security, accessibility, analytics and device paths on the final commit.

Before or during acceptance:
1. Run the Hardware QA in §G on one iPhone and one Android phone.
2. Schedule LOW-1 (Account read batching) before onboarding very large families. LOW-2 and LOW-3 are
   authoring-QA advisories for the content team.
3. Keep OPEN-14 and OPEN-15 with the client. Acceptance should not treat the BLOCKED items as defects.

### QA fixtures left on staging

The QA parent and its `QA …` children (including R5, Final, Keys, Dropoff and Fallback). Missions `qa-final-2u3zf`
(v1 archived, v2 published but not in the catalogue, v3 draft with tilt/shake screens) and its unpublished copy,
plus the earlier `qa-*` missions. All are unpublished from the public catalogue.

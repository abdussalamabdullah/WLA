# WLA Academy — table-to-requirement mapping

Every table, why it exists, and whether the MVP needs it. Produced before any
further schema work, per the client instruction of 2026-09-25.

**Rule applied throughout:** no table exists for a deferred feature. Mission
Board contribution/moderation, mission replay, My Missions search/filter and
notifications have **no schema** and must not acquire any (Architecture §22).

---

## Core Academy tables (migration `20260925220000_init.sql`)

### 1. `profiles`

|                   |                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**       | The parent/guardian account. Extends `auth.users` with the minimum WLA needs.                                                                    |
| **Source**        | Tech Spec §6; Architecture §3 ("the parent owns the account, access and permissions")                                                            |
| **MVP**           | **Required.** Everything hangs off it.                                                                                                           |
| **Relationships** | `auth.users` 1:1 → `profiles` 1:N → `child_profiles`                                                                                             |
| **Notes**         | Tech Spec §6: "Do not collect additional personal information simply because the database could accommodate it." Four columns; keep it that way. |

### 2. `child_profiles`

|                   |                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**       | The learner identity that owns mission progress and the learning record.                                                       |
| **Source**        | Tech Spec §7; Architecture §3; PRD §7.2                                                                                        |
| **MVP**           | **Required.** Multi-child support is locked, not optional.                                                                     |
| **Relationships** | `profiles` 1:N → `child_profiles` 1:N → entitlements, progress, evidence                                                       |
| **Notes**         | `birth_year` only, not full DOB — Brief §46 forbids unnecessary sensitive child data. Whether age gates access is **OPEN-05**. |

### 3. `missions`

|                   |                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | The mission definition. What the mission _is_ — never what a child has done.                                                                                                  |
| **Source**        | Tech Spec §9; PRD §17                                                                                                                                                         |
| **MVP**           | **Required.**                                                                                                                                                                 |
| **Relationships** | 1:N → screens, resources, entitlements, progress; 1:1 → parent note                                                                                                           |
| **Notes**         | Carries commercial data (`price_minor`, `currency`) so UI never hard-codes either. `version` supports Tech Spec §53 so editing a live mission cannot corrupt in-flight state. |

### 4. `mission_screens`

|                   |                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Mission _content_, rendered by the shared engine. `type` selects the component.                                                                          |
| **Source**        | Tech Spec §15–§16; PRD §16                                                                                                                               |
| **MVP**           | **Required** — this is what makes missions configuration rather than code.                                                                               |
| **Relationships** | `missions` 1:N → `mission_screens`                                                                                                                       |
| **Notes**         | Currently **empty by design**: no approved Build Brief (OPEN-03). `configuration` JSON is validated by zod in the engine, per Tech Spec §12's condition. |

### 5. `mission_resources`

|                   |                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Mission Kit — what WLA gives the child.                                                                                                       |
| **Source**        | Tech Spec §19; Architecture §7                                                                                                                |
| **MVP**           | **Required.** Six Names alone has five.                                                                                                       |
| **Relationships** | `missions` 1:N → `mission_resources`; files in the `mission-resources` bucket                                                                 |
| **Notes**         | Per-resource `can_view` / `can_print` / `can_download` so UI shows only applicable actions (UI/UX §30). Reads here must never write progress. |

### 6. `mission_parent_notes`

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | The Mission Note for Parents.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Source**          | Tech Spec §21; Architecture §8                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **MVP**             | **Required.**                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Relationships**   | `missions` 1:1 → `mission_parent_notes` (unique on `mission_id`)                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Notes**           | Belongs to the mission, not the child. Separate table rather than a `missions` column because it is long-form and separately edited.                                                                                                                                                                                                                                                                                                                                   |
| **`document_path`** | Added 2026-09-27. Optional print-ready note in the private `mission-resources` bucket, under the mission's own folder, so the existing bucket policy covers it unchanged. Deliberately NOT a `mission_resources` row: that table is the child's Mission Kit, and Architecture §8 keeps For Parents separate from it (Brief §17 forbids the two collapsing into one "files" area). NULL means the note is text only, and For Parents falls back to rendering `content`. |

### 6b. `analytics_events` (added 2026-09-28)

|                   |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | ANALYTICS-01 — mission starts and completions are countable.                                                                                                                                                                                                                                                                                                                                                                     |
| **Source**        | PRD §32; Tech Spec §42; Brief §53                                                                                                                                                                                                                                                                                                                                                                                                |
| **MVP**           | **Required** (ANALYTICS-01 is a Should; OPS-02 versioning is a Must).                                                                                                                                                                                                                                                                                                                                                            |
| **Relationships** | `missions` 1:N → `analytics_events`. Deliberately NOT related to a child.                                                                                                                                                                                                                                                                                                                                                        |
| **Notes**         | Stores `name`, `mission_id`, `mission_version`, `occurred_at`. **No child id, no progress id, no parent id, no content.** The child id is an authorisation input to `record_mission_event()` and is discarded. RLS is on with **no client policy at all** — writes go through the definer function, reads through `admin_mission_stats()`. Drop-off is derived from `mission_progress`, never tracked as an event (conflict C7). |

### 7. `mission_entitlements`

|                   |                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**       | Does this child have access to this mission?                                                                                                                                                                                                                 |
| **Source**        | Tech Spec §10; PRD §9; Architecture §3                                                                                                                                                                                                                       |
| **MVP**           | **Required.** "Catalogue ≠ entitlement ≠ progress."                                                                                                                                                                                                          |
| **Relationships** | `child_profiles` N:M `missions`, unique on `(child_id, mission_id)`                                                                                                                                                                                          |
| **Notes**         | `source` records free/purchase/gift/redeemed/admin, but **access logic never branches on it** — the Academy asks whether access is valid, not why it was granted. No client insert policy exists; only the verified Stripe webhook writes paid entitlements. |

### 8. `mission_progress`

|                   |                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Status and position for one child in one mission.                                                                                                                                      |
| **Source**        | Tech Spec §11, §50; Architecture §19                                                                                                                                                   |
| **MVP**           | **Required.**                                                                                                                                                                          |
| **Relationships** | `child_profiles` + `missions` → `mission_progress`, unique on `(child_id, mission_id)`                                                                                                 |
| **Notes**         | Keys on `child_id`, never `parent_id` (Tech Spec §50). The unique constraint enforces Tech Spec §27's "no duplicate progress records" in the database rather than in application code. |

### 9. `mission_state`

|                   |                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Mission-specific persisted state: visited screens, choices, reveals, confirmed handoffs.                                                                                                          |
| **Source**        | Tech Spec §12–§13; Architecture §19                                                                                                                                                               |
| **MVP**           | **Required** for pause/resume, which is an MVP requirement (PRD §19).                                                                                                                             |
| **Relationships** | `mission_progress` 1:1 → `mission_state`                                                                                                                                                          |
| **Notes**         | A single JSON column on purpose. Tech Spec §13 explicitly rejects a table-per-concept design; Architecture §19 forbids forcing every mission into one internal sequence. Validated by the engine. |

### 10. `mission_responses`

|                   |                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | The child's saved answers, one row per screen.                                                                                                                                                                                                                |
| **Source**        | Tech Spec §49; PRD §18                                                                                                                                                                                                                                        |
| **MVP**           | **Required** where a mission asks for a response.                                                                                                                                                                                                             |
| **Relationships** | `mission_progress` 1:N → `mission_responses`, unique on `(progress_id, screen_key)`                                                                                                                                                                           |
| **Notes**         | Split out of `mission_state` so Mission Trail can surface a child's own words without parsing an opaque blob. **Could be deferred** into `state_data` if you want a smaller MVP — but retrieving Trail content would get materially worse. Recommend keeping. |

### 11. `mission_evidence`

|                   |                                                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Mission Trail — the child's private record of selected evidence.                                                                                                                                                                                                            |
| **Source**        | Tech Spec §22–§23; Architecture §15                                                                                                                                                                                                                                         |
| **MVP**           | **Required.** TRAIL-01 is a Must.                                                                                                                                                                                                                                           |
| **Relationships** | `child_profiles` + `missions` → `mission_evidence`; digital files in the `mission-evidence` bucket                                                                                                                                                                          |
| **Notes**         | `type` distinguishes physical from digital, with a CHECK constraint forcing digital evidence to carry a `storage_path` and permitting physical to have none. This is the database enforcing Brief §27's rule that the Academy must not imply it stores a physical artefact. |

---

### 11b. `mission_state_private` (added 2026-10-04, migration 0027)

|                   |   |
| ----------------- | - |
| **Purpose**       | The server-only half of a run's state: hidden variables, the randomisation seed, fired events, the assigned variant. |
| **Source**        | Enhancement Plan §3 (hidden variables, variants, randomisation); D-80 |
| **MVP**           | **Required** by current scope (the Enhancement Plan). |
| **Existing table?** | Not `mission_state`: families can read their own state, and these values must never reach a client. A column with a column-level grant was rejected because the whole row is read by family queries. |
| **Child data**    | No personal data — mission mechanics only, keyed on the run. |
| **Notes**         | No client grants at all; read and written only by `engine_load_run` / `engine_save` (service role). |

### 11c. `mission_assets` (added 2026-10-04, migration 0032)

|                   |   |
| ----------------- | - |
| **Purpose**       | Media a screen shows — images, diagrams, maps, animation, audio, video — pinned to a mission version, with alt text, long description, transcript and captions. |
| **Source**        | Enhancement Plan §7 (F7); §12 asset management; Architecture §20 (accessibility) |
| **MVP**           | **Required** by current scope. |
| **Existing table?** | Not `mission_resources`: that is the Mission Kit — what WLA gives the family to print and keep, listed on the Kit page (Brief §17). Screen media is never a file the family browses; folding it in would list every diagram in the Kit. |
| **Child data**    | None. WLA-authored content only. |
| **Notes**         | No client grants; admins author through draft-only functions; learners receive server-signed URLs for the current screen only. Immutable once published; copied by new versions and duplicates. Private bucket `mission-media`. |

---

## Content tables (migration `20260925220100_editable_content.sql`)

Added to satisfy **CMS-01**, which is a Must. Decision D-08 / conflict C3.

### 12. `journal_categories` · 13. `journal_articles`

|                   |                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Editable Journal content.                                                                                                                |
| **Source**        | PRD §28; Tech Spec §39; CMS-01                                                                                                           |
| **MVP**           | **Deferrable from the Academy build.** These are public-site scope (D-02). Schema exists so CMS-01 has a home; **no admin UI is built.** |
| **Relationships** | `journal_categories` 1:N → `journal_articles`                                                                                            |
| **Notes**         | Safe to drop from the first deployment if the public site stays on its existing implementation. Nothing in the Academy reads them.       |

`profiles.is_admin` was added in the same migration — a manual flag with no
self-service route, gating the eventual admin.

---

## Summary

| Required now                                                                                                                                                                   | Deferrable                                                                                              | Must not exist                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| profiles · child_profiles · missions · mission_screens · mission_resources · mission_parent_notes · mission_entitlements · mission_progress · mission_state · mission_evidence | mission_responses (foldable into `state_data`, not recommended) · journal_categories · journal_articles | Mission Board submissions/moderation · replay history · search indexes · notification queues · points/badges/streaks · public profiles |

**Ten tables are genuinely load-bearing for the Academy MVP.** The count is
proportionate: each maps to a Must-priority requirement, and the two most
easily over-engineered areas — mission state and mission content — are
deliberately one JSON column and one generic table rather than the "dozens of
tables" Tech Spec §13 warns against.

### Before adding any table, answer:

1. Which numbered requirement does it serve?
2. Is that requirement Must, or is it deferred by Architecture §22?
3. Can an existing table carry it without becoming incoherent?
4. Does it store child data that Brief §46 says not to collect?

If 2 is "deferred", stop.

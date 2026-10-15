# Journal CMS

Decisions: D-123 … D-133 in `DECISIONS.md` (D-130 optional approval, D-131
Lovable + public API, D-132 pg_cron scheduling, D-133 time policy). Open:
OPEN-23 (the real Medium export). Tables: `DATA-MODEL.md` → "Journal CMS".
Public API for Lovable: `JOURNAL-PUBLIC-API.md`.

## 1. Shape

- **WLA app (this repo)** is the CMS and backend: the studio at `/editorial`,
  the database, media, scheduling, and a public read-only JSON API at
  `/api/journal/*`.
- **Lovable** renders the public Journal at `/journal` from that API.
  There is no public Journal page in this app (`/journal` here is the
  original stub) and no second content store.

## 2. Content model

Every edit lives in a `journal_revisions` row. An article has a **working**
revision and, once published, a **live** revision (a pointer). The public API
reads only the live pointer, so editing a published article never shows the
draft: readers keep the live version until someone explicitly publishes the
new one.

Revision states: draft → (optional: in_review → changes_requested | approved)
→ live → retired; `superseded` when an approved revision is replaced by a new
draft. In-review, approved and live revisions are immutable (trigger); a
scheduled revision cannot be saved.

Display states (draft, in review, changes requested, approved, scheduled,
published, archived) are derived; a published article can also show "new
version: draft / in review".

## 3. Publishing and permissions (enforced in the database)

| | Writer (author of the article) | Writer (collaborator) | Reviewer | Editor | Admin |
| --- | --- | --- | --- | --- | --- |
| Create article | ✓ | ✓ | | ✓ | ✓ |
| Edit | ✓ | ✓ | | any | any |
| Publish now / schedule / cancel schedule / unpublish | ✓ | | | any | any |
| Ask for a review (optional) | ✓ | ✓ | | any | any |
| Approve / request changes | | | when assigned, not on a version they edited | same | same |
| Comment | ✓ | ✓ | when assigned | any | any |
| Assign reviewers, archive, delete never-published drafts, categories, import | | | | ✓ | ✓ |
| Grant roles | | | | | ✓ |

- **No approval is needed to publish** (D-130). Review is optional collaboration.
- Only the **working** revision can be published, named by the content hash
  the publisher last saw saved; a stale page is refused. The studio hides
  Publish/Schedule while the editor has unsaved changes.
- Publishing needs a title, URL slug and body, and a slug no other article uses.
- Every publish, unpublish, schedule, cancel, scheduler outcome and retry is
  in `journal_audit`, with the content hash.
- Visitors and parents cannot read any Journal table except categories; no
  client role can write any Journal table.

## 4. Scheduled publishing (D-132, D-133)

**Mechanism:** Supabase **pg_cron** runs `select public.journal_publish_due()`
every minute inside the database. No page visit, browser timer, HTTP endpoint
or secret is involved, and it does not depend on the Vercel plan (Vercel Cron
on Hobby runs at most daily).

**What a run does:** every article whose `scheduled_for` has passed is
re-checked — not archived, still the working revision, publishable, content
hash unchanged since it was scheduled, the person who scheduled it can still
publish it, slug still free — and published, or its schedule is cancelled with
the reason audited.

**Safety:**
- missed runs: the next run picks up everything overdue;
- overlapping or duplicate runs: `for update skip locked` and go-live clearing
  the schedule mean an article is published exactly once (tested with two
  concurrent sessions);
- failures: each article runs in its own sub-transaction; an unexpected error
  keeps the schedule and is retried next minute (audited as a retry); after 5
  consecutive errors the schedule is cancelled and audited as failed;
- `journal_publish_due()` cannot be called by any client role.

**Visibility:** editors see in the studio whether the job is configured and
active, its last run, and how many scheduled articles are overdue.

**Time:** stored as UTC instants; scheduled in **UK time (Europe/London)**
whatever the editor's device zone, with the UTC conversion shown before
saving; a time skipped when the clocks go forward is refused; the repeated
hour in October takes the first (BST) occurrence and says so. Publication
happens within about a minute of the scheduled instant; the public API may
serve the previous state for up to ~60 s more (CDN cache).

**Deployment:**
- Local Supabase and hosted Supabase both preload pg_cron. The migration runs
  `create extension if not exists pg_cron with schema pg_catalog` and
  registers the job `journal-publish-due` (`* * * * *`) — idempotent.
- Verify after applying:
  `select jobname, schedule, active from cron.job where jobname = 'journal-publish-due';`
  and, a minute later,
  `select status, end_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'journal-publish-due' order by start_time desc limit 3;`
- If the extension cannot be created on a hosted project, the migration still
  applies, raises a warning, and the studio shows "Automatic publishing is NOT
  set up". Fix: enable pg_cron in the Supabase dashboard (Database →
  Extensions), then run the `cron.schedule(...)` line from the migration.
- Nothing is needed in Vercel and no environment variable is added.
  `NEXT_PUBLIC_SITE_URL` (already used by the QR page) is read, if set, for
  the absolute image URLs the API returns.

## 5. Files

**Schema:** `supabase/migrations/20261014120000_journal_cms.sql` (additive).

**Server:** `src/features/journal/` — `actions.ts`, `queries.ts` (studio),
`public-api.ts` + `http.ts` (public API), `content.ts` (allowlist sanitiser,
slugs), `status.ts`, `errors.ts`, `time.ts` (London time), `media.ts`,
`medium.ts`, `importer.ts`; `src/lib/permissions/journal.ts`.

**Routes:** `src/app/api/journal/{articles,articles/[slug],categories,tags,media/[id]}`,
`src/app/editorial/**`.

**UI:** `src/components/journal/**`; Journal link in the admin nav;
`/editorial` in the middleware's signed-in prefixes; `.wla-article-body`
typography.

**Tests:** `scripts/journal-regression.sql` + `scripts/run-journal-regression.sh`
(isolated cluster, `cron=absent`, incl. concurrent sessions);
`scripts/run-journal-regression-local.sh` (the real local stack, `cron=present`,
one transaction rolled back, every table fingerprinted before and after — the
scheduler must be configured, active and succeeding; an undeclared environment
fails S25); `scripts/run-journal-cron-check.sh`
(real pg_cron in a throwaway container of the same image as the local stack,
migrations applied as `postgres` — the non-superuser role `supabase migration
up` uses — including a re-registration check for duplicate jobs);
`src/features/journal/__tests__/*`, `src/components/journal/__tests__/*`.

## 6. Applying the migration (needs approval)

The local WLA database has **three** unapplied migrations, not one:

| Migration | What it does to the local database |
| --- | --- |
| `20261010120000_seeded_mission_version_lifecycle` (D-111) | Adds a backfill function and runs it; it only initialises missions with **no** version rows. Six Names already has v1 (archived) and v2 (published), so it initialises nothing. |
| `20261011120000_kit_rows_follow_release` (D-114) | Tightens two family read policies (draft Kit rows / notes hidden) and one child-session function. No data change. |
| `20261014120000_journal_cms` | The Journal CMS. Additive; enables pg_cron and registers the job. |

`supabase migration up` applies all three in order and never resets. Then
verify as in §4 and §8.

## 7. Migrating from Medium

1. On Medium: Settings → Security and apps → **Download your information**.
2. Give someone the editor role (`/editorial/people`, admin only).
3. `/editorial/import` → upload the .zip (or post `.html` files).
4. Read the report: missing alt text, embeds not imported, links back to
   Medium, renamed slugs, failed images. Fix each in its draft.
5. Add tags (Medium's export has none) and categories.
6. Publish or schedule each article (a review is optional).
7. Re-running the same export is safe (unchanged → skipped; edited here →
   never overwritten; interrupted → resumed).

## 8. Next steps after applying

1. Sign in as the local admin, grant roles at `/editorial/people`.
2. Write → save → publish; edit the published article and confirm the API
   (`/api/journal/articles/<slug>`) still returns the old text until you
   publish again; schedule one a few minutes ahead and confirm it appears in
   the API on its own.
3. Upload an image, publish, and open its `/api/journal/media/<id>` URL
   signed out.
4. Then wire Lovable to the API (`JOURNAL-PUBLIC-API.md`).

## 9. Known limitations

- No real-time co-editing; conflicts are detected, not merged (D-128).
- Publication can lag the scheduled instant by up to a minute, plus API caching.
- External links are not checked for reachability.
- Medium embeds (video, gists, tweets) and tags need adding by hand.
- Uploaded files are never deleted (revisions refer to them).
- Search is Postgres full-text (English) over live articles.
- A renamed article returns `movedTo` from the API; Lovable must do the redirect.

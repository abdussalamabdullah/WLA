# Acceptance browser QA (staging)

Headless Chrome over CDP, no npm dependencies (`cdp.mjs`). Drives the
production build (`npx next start -p 3100`, `BASE` to override) against hosted
staging. Run from this directory; state files (`qa-parent.json`,
`qa-kids.json`) are written here and are gitignored-worthy — delete them after.

Order used for the 2026-09-29/30 acceptance run (see docs/LMS-EVOLUTION-PROGRESS.md):

1. `node anon.mjs` — anonymous access, catalogue, auth redirects
2. `node fixtures.mjs parent && node setup.mjs && node fixtures.mjs grant`
3. `node parentB.mjs` — review parent B: collection, tabs, switcher, Kit, For Parents, Trail
4. `node sixnames.mjs` — all six Six Names branches as child sessions (`ONLY=`, `SKIP=`, `TRACE=1`)
5. `PHASES=A,B,C,D,E,F,G,H node admin.mjs` — no-code lifecycle of a QA mission, end to end
6. `node e2.mjs` / `node child-edge.mjs` — child isolation, code revoke/regenerate, rate limit
7. `node childkit.mjs` — child opens a Kit file via /api/kit (D-64); uses and restores reviewer child Ada
8. `node a11y.mjs`, `WHO=parent|child|admin node a11y2.mjs`, `node a11y-builder.mjs` — 390/834/1512
9. `node cleanup.mjs`

Every run consumes one Six Names run per branch child (no replay), so step 2
must be repeated for a fresh six-branch pass.

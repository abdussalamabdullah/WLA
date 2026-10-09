import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cn } from "@/lib/utils";
import { resolveMissionCover } from "@/features/missions/covers";
import { join } from "node:path";

const repo = join(__dirname, "../../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");

/**
 * Source with comments removed.
 *
 * Guards that search for a word must use this, not `read`. Several of these
 * tests previously passed because the very comment explaining why a pattern
 * is forbidden CONTAINED that pattern — the capitals guard went green off the
 * sentence "the site sets uppercase in exactly one place". A guard that can be
 * satisfied by prose is not a guard.
 */
/** Every .ts/.tsx under src, so a guard cannot miss a file by not naming it. */
function listSourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(repo, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listSourceFiles(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

const kit = read("src/features/missions/resources.ts");
const trail = read("src/features/mission-trail/queries.ts");
const init = read("supabase/migrations/20260925220000_init.sql");
const kitPage = read(
  "src/app/(academy)/academy/missions/[missionId]/kit/page.tsx",
);
const trailPage = read(
  "src/app/(academy)/academy/missions/[missionId]/trail/page.tsx",
);
const evidenceItem = read("src/components/mission/evidence-item.tsx");

// ───────────────────────────────────────── Mission Kit resource access ──────
describe("Mission Kit storage access", () => {
  it("is entitlement-gated before any URL is minted", () => {
    const verifyAt = kit.indexOf("requireEntitledMission(");
    const signAt = kit.indexOf("createSignedUrls(");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(signAt);
  });

  it("uses the caller's session, never the service role", () => {
    // A service-role URL would bypass the bucket policy, which is the
    // independent second check on family ownership.
    expect(kit).not.toContain("createAdminClient");
    expect(kit).not.toContain("SERVICE_ROLE");
  });

  it("mints short-lived signed URLs, never public ones", () => {
    // Tech Spec §47 — no permanent public URLs.
    expect(kit).toContain("createSignedUrls");
    expect(kit).not.toContain("getPublicUrl");
    expect(kit).toContain("SIGNED_URL_TTL_SECONDS");
  });

  it("a missing file degrades to unavailable rather than failing the Kit", () => {
    // Architecture §7 keeps the Kit available throughout; one absent asset
    // must not take down the others.
    expect(kit).toContain("s.error ? null : s.signedUrl");
    expect(kit).toContain("url: urlByPath.get(resource.storage_path) ?? null");
  });

  it("the Kit page fetches real URLs rather than stubbing them", () => {
    expect(kitPage).not.toContain("url={null}");
    /*
     * The Kit now serves two actors (D-63/D-64), so it goes through the facade
     * rather than calling getMissionKit directly: a parent gets signed URLs
     * minted with their own session, a child gets links to the re-authorising
     * handler. The guard's point is unchanged — the page must not render
     * placeholder nulls.
     */
    expect(kitPage).toContain("getKitFor");
  });

  it("a child's Kit links go through the authorising handler, never a signed URL", () => {
    const play = read("src/features/academy/play.ts");
    expect(play).toContain("`/api/kit/${r.id}`");
    // and the handler decides in the database, not in the route
    const route = read("src/app/api/kit/[resourceId]/route.ts");
    expect(route).toContain("child_session_resource_path");
    expect(route).not.toMatch(/p_child_id/);
  });

  it("the bucket is private and entitlement-scoped in RLS", () => {
    expect(init).toContain("('mission-resources', 'mission-resources', false)");
    expect(init).toContain(
      'create policy "entitled families read mission resources"',
    );
    expect(init).toContain(
      "e.mission_id::text = (storage.foldername(name))[1]",
    );
  });
});

// ──────────────────────────────────── digital Mission Trail evidence ────────
describe("Mission Trail evidence access", () => {
  it("is child-scoped before any URL is minted", () => {
    expect(trail).toContain('.eq("child_id", child.id)');
    const verifyAt = trail.indexOf("requireEntitledMission(");
    const signAt = trail.indexOf("createSignedUrls(");
    expect(verifyAt).toBeLessThan(signAt);
  });

  it("uses the caller's session, never the service role", () => {
    expect(trail).not.toContain("createAdminClient");
  });

  it("physical evidence is NEVER given a URL", () => {
    /*
     * Architecture §15 / Brief §27 / UI/UX §44 — the Academy must not imply it
     * holds an artefact it does not. Only rows with a storage_path are signed,
     * and physical rows cannot have one.
     */
    expect(trail).toContain('r.type === "digital" && r.storage_path');
    expect(trail).toContain("evidence.storage_path\n      ? (urlByPath.get");
  });

  it("response-backed digital evidence also gets no URL", () => {
    // Its content is text in `description`, not a file.
    expect(trail).toContain("paths.length === 0");
  });

  it("the component still distinguishes physical from stored", () => {
    expect(evidenceItem).toContain(
      'isPhysical ? "You keep this" : "Saved here"',
    );
    expect(evidenceItem).toContain("it isn&rsquo;t stored in the Academy");
  });

  it("the Trail page no longer hard-codes url={null}", () => {
    expect(trailPage).not.toContain("url={null}");
  });

  it("evidence URLs are shorter-lived than Kit URLs", () => {
    expect(trail).toContain("EVIDENCE_URL_TTL_SECONDS = 15 * 60");
    expect(kit).toContain("SIGNED_URL_TTL_SECONDS = 60 * 60");
  });

  it("the evidence bucket is private and family-scoped", () => {
    expect(init).toContain("('mission-evidence',  'mission-evidence',  false)");
    expect(init).toContain('create policy "family reads own evidence files"');
    expect(init).toContain("owns_child(((storage.foldername(name))[1])::uuid)");
  });

  it("no upload requirement was added to Six Names", () => {
    // Brief §6 — "No upload is required."
    const seed = read("supabase/seed/six_names_screens.sql");
    expect(seed).not.toMatch(/upload/i);
    for (const f of [
      "src/features/missions/resources.ts",
      "src/features/mission-trail/queries.ts",
    ]) {
      expect(read(f)).not.toContain(".upload(");
    }
  });
});

// ─────────────────────────────────────────── journey states (Phase 8) ──────
describe("system states are reachable", () => {
  const states = read("src/components/system/states.tsx");

  it("every built state component is wired to something", () => {
    /*
     * Brief §40 and UI/UX §53–§56 require loading, empty, error, unavailable
     * and restoring states to be resolved rather than left for development to
     * invent. They were all built — three of them were unreachable.
     */
    const wiring: Record<string, string[]> = {
      LoadingState: [
        "src/app/(academy)/loading.tsx",
        "src/app/account/loading.tsx",
      ],
      RestoringState: [
        "src/app/(academy)/academy/missions/[missionId]/active/loading.tsx",
      ],
      ErrorState: ["src/app/(academy)/error.tsx"],
      UnavailableState: [
        "src/app/(academy)/academy/missions/[missionId]/kit/page.tsx",
      ],
    };
    for (const [component, files] of Object.entries(wiring)) {
      expect(states, `${component} must exist`).toContain(
        `export function ${component}`,
      );
      for (const file of files) {
        expect(read(file), `${component} in ${file}`).toContain(component);
      }
    }
  });

  it("the error boundary never surfaces the raw error", () => {
    // UI/UX §55 forbids messages like "Error 500: failed to fetch mission_state".
    const boundary = read("src/app/(academy)/error.tsx");
    expect(boundary).not.toContain("{error.message}");
    expect(boundary).not.toContain("error.stack");
    expect(boundary).toContain("Your mission progress is safe.");
  });

  it("not-found does not confirm whether a mission exists", () => {
    // Tech Spec §26 — an unentitled request must not learn the mission is real.
    // Rendered copy only — the file's comment names the rule it enforces.
    const nf = read("src/app/(academy)/not-found.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(nf).not.toMatch(/you don.t have access|not entitled|purchase/i);
  });

  it("unavailable is distinguished from empty", () => {
    const kitPage = read(
      "src/app/(academy)/academy/missions/[missionId]/kit/page.tsx",
    );
    expect(kitPage).toContain("No materials for this mission");
    expect(kitPage).toContain("aren't available right now");
    expect(kitPage).toContain("kit.items.every((item) => item.href === null)");
  });
});

describe("Academy chrome renders once, and quietly in Active Mission", () => {
  /*
   * REGRESSION GUARD.
   *
   * The header used to live in (academy)/layout.tsx, with a nested layout
   * under active/ rendering a second "quiet" one. Next.js layouts COMPOSE
   * rather than replace, so Active Mission showed TWO headers stacked — the
   * opposite of UI/UX §17, which asks it to become quieter.
   *
   * The layout now renders no header; each page picks its own variant.
   */
  const pages = [
    "src/app/(academy)/academy/my-missions/page.tsx",
    "src/app/(academy)/academy/missions/[missionId]/page.tsx",
    "src/app/(academy)/academy/missions/[missionId]/kit/page.tsx",
    "src/app/(academy)/academy/missions/[missionId]/parents/page.tsx",
    "src/app/(academy)/academy/missions/[missionId]/complete/page.tsx",
    "src/app/(academy)/academy/missions/[missionId]/trail/page.tsx",
    "src/app/(academy)/academy/missions/[missionId]/active/page.tsx",
  ];

  it("the Academy layout renders no header", () => {
    // Rendered output only — the comment names what it deliberately omits.
    const layout = read("src/app/(academy)/layout.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(layout).not.toContain("AcademyHeader");
    expect(layout).not.toContain("AcademyChrome");
  });

  it("there is no nested Active Mission layout to stack a second one", () => {
    expect(() =>
      read("src/app/(academy)/academy/missions/[missionId]/active/layout.tsx"),
    ).toThrow();
  });

  /*
   * The LMS brief gave the Academy an application shell (sidebar + identity),
   * so "chrome" is now one of TWO things: <AcademyShell> for the collection
   * and mission surfaces, or <AcademyChrome variant="quiet" /> for Active
   * Mission. The invariant is unchanged and is what this asserts: exactly one
   * per page, never both stacked.
   */
  it("every Academy page renders exactly one chrome", () => {
    for (const page of pages) {
      const body = read(page);
      const chrome = body.match(/<AcademyChrome[^>]*\/>/g) ?? [];
      const shell = body.match(/<AcademyShell>/g) ?? [];
      expect(chrome.length + shell.length, `${page} must render exactly one chrome`)
        .toBeGreaterThanOrEqual(1);
      expect(chrome.length > 0 && shell.length > 0, `${page} stacks two chromes`)
        .toBe(false);
    }
  });

  /*
   * Active Mission keeps the QUIET chrome and must never gain the sidebar.
   * Architecture §9 and UI/UX §33–§35 make it the quietest surface in the
   * product; a persistent nine-item sidebar beside the one thing a child is
   * meant to be doing is the opposite of that.
   */
  it("only Active Mission uses the quiet variant", () => {
    for (const page of pages) {
      const quiet = read(page).includes('variant="quiet"');
      expect(quiet, page).toBe(page.includes("/active/"));
    }
  });

  it("Active Mission never gains the application shell", () => {
    const active = read("src/app/(academy)/academy/missions/[missionId]/active/page.tsx");
    expect(active).not.toContain("AcademyShell");
  });
});

// ────────────────────────────────── Six Names Mission Kit assets & price ────
describe("Six Names Mission Kit assets", () => {
  const seed = read("supabase/seed/six_names.sql");
  const assetDir = join(repo, "supabase/seed/assets/six-names");

  const SUPPLIED = [
    "six-names-mission-board.pdf",
    "six-names-whats-changing-tracker.pdf",
    "six-names-concern-cards.pdf",
    "six-names-judgement-cards.pdf",
  ];

  it("the four supplied PDFs are version-controlled under the seeded filenames", () => {
    for (const file of SUPPLIED) {
      const bytes = readFileSync(join(assetDir, file));
      // A real PDF, not a placeholder.
      expect(bytes.subarray(0, 5).toString(), file).toBe("%PDF-");
      expect(bytes.length, file).toBeGreaterThan(10_000);
      // And the seed points at exactly this name.
      expect(seed, file).toContain(`'${file}'`);
    }
  });

  it("the Child Mission asset is the supplied PDF, not a fabricated one", () => {
    /*
     * Outstanding until the client supplied it on 2026-09-27. Until then the
     * row was seeded and the file absent, so the Kit listed it honestly and
     * degraded to its unavailable state — no substitute was generated, which
     * is what D-39 requires and what the client instructed.
     *
     * Now present: a real 8-page PDF whose content matches the Child Mission
     * document the mission was authored from.
     */
    const pdf = readFileSync(join(assetDir, "six-names-child-mission.pdf"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    // The row was always seeded; it now resolves to a file.
    expect(seed).toContain("'six-names-child-mission.pdf'");
  });

  it("storage paths stay mission-scoped, matching the bucket policy", () => {
    // The policy matches (storage.foldername(name))[1] against mission_id, so
    // the first path segment must be the mission UUID.
    expect(seed).toContain("m.id || '/' || r.file");
    expect(read("supabase/migrations/20260925220000_init.sql")).toContain(
      "e.mission_id::text = (storage.foldername(name))[1]",
    );
  });
});

describe("Six Names commercial configuration", () => {
  const seed = read("supabase/seed/six_names.sql");

  it("is priced at £12.00 in GBP minor units", () => {
    expect(seed).toContain("1200");
    expect(seed).toContain("'GBP'");
    expect(seed).toContain("set price_minor = 1200");
  });

  it("price is applied explicitly, because the insert cannot update", () => {
    // `on conflict (slug) do nothing` means an existing mission keeps its row,
    // so commercial data is set by a following UPDATE — the same pattern
    // six_names_screens.sql uses for completion_rule.
    expect(seed).toContain("on conflict (slug) do nothing");
    expect(seed).toContain("update missions");
    expect(seed).toContain("where slug = 'six-names'");
  });

  it("the apply-once seed caveat is documented where it will be seen", () => {
    /*
     * D-37. `db push --include-seed` recorded this file's new hash without
     * executing it, leaving the price NULL. The warning lives at the top of
     * the seed itself because that is what the next person edits.
     */
    const header = seed.slice(0, seed.indexOf("insert into missions"));
    expect(header).toContain("SEEDS ARE APPLY-ONCE");
    expect(header).toContain("Updating seed hash");
    expect(header).toContain("Verify the data.");
    // And it must not propose re-architecting seeding to dodge the problem.
    expect(header).toContain("not an architectural problem");
  });

  it("re-seeding never publishes the mission", () => {
    // published is an operational decision, not seed data (OPEN-13).
    const updateBlock = seed.slice(seed.indexOf("update missions"));
    expect(updateBlock).not.toContain("published");
  });

  it("the mission is not free, so it must travel through Stripe", () => {
    // is_free is the value immediately after delivery_type ('hybrid').
    expect(seed).toMatch(/'hybrid',\s*\n\s*false,/);
    const checkout = read("src/features/commerce/checkout.ts");
    expect(checkout).toContain("unit_amount: mission.price_minor");
    expect(checkout).toContain("currency: mission.currency.toLowerCase()");
  });
});

// ──────────────────────────────────────────────── design system craft ──────
describe("design refinements hold", () => {
  const tokens = read("src/styles/tokens.css");
  const globals = read("src/app/globals.css");
  /* Absence assertions must run against stripped source: the comment that
     explains why a value is forbidden inevitably contains that value. */
  const globalsCode = code("src/app/globals.css");

  it("the locked palette and typefaces are unchanged", () => {
    // Designer Brief locks these five; D-33 locks the pairing. A design pass
    // refines within them, it does not reopen them (Handover §12).
    for (const hex of ["#f5efe3", "#3a2f2a", "#5f6a4f", "#a3b18a", "#b87c5a"]) {
      expect(tokens.toLowerCase()).toContain(hex);
    }
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("Fraunces");
    expect(layout).toContain("Karla");
  });

  it("the type scale stays pinned to the measured values", () => {
    /*
     * Five steps were measured from the public site by cap height (see
     * docs/DESIGN-LANGUAGE §3); the rest interpolate. If one of these drifts,
     * the Academy has stopped matching the site it is supposed to match.
     */
    /*
     * Display and h1 are fluid, with the MEASURED value as the ceiling so
     * they land exactly on the site's numbers at the 1512px viewport the
     * captures were taken at. The ceiling is what this guard pins; the floor
     * is estimated, because the site's own small-screen type was never
     * captured and so could not be measured.
     */
    expect(tokens).toContain("3.75rem)"); // display ceiling, 60px
    expect(tokens).toContain("2.3125rem)"); // h1 ceiling, 37px
    expect(tokens).toMatch(/--text-display:\s*clamp\(/);
    expect(tokens).toMatch(/--text-h1:\s*clamp\(/);
    expect(tokens).toContain("--text-h3: 1.375rem"); // 22px
    expect(tokens).toContain("--text-body: 1.125rem"); // 18px
    expect(tokens).toContain("--text-small: 0.9375rem"); // 15px
    // Display leading is measurably tighter than heading leading, not equal.
    expect(tokens).toContain("--leading-display: 1.08");
    expect(tokens).toContain("--leading-relaxed: 1.62");
  });

  it("shape matches the site: one surface radius, pills only for the CTA", () => {
    /*
     * MEASURED by scanning corner pixels: cards and images sit at 5–6px and
     * the primary CTA is a true pill. The Phase 2 scale (10/14/16/18) was
     * judged rather than measured and was wrong in direction. Aliases keep
     * the old token names resolving to the one measured value.
     */
    expect(tokens).toContain("--radius-surface: 6px");
    expect(tokens).toContain("--radius-card: var(--radius-surface)");
    expect(tokens).toContain("--radius-panel: var(--radius-surface)");
    expect(tokens).toContain("--radius-input: var(--radius-surface)");
    expect(tokens).toContain("--radius-button: 999px");
    // The site draws no shadow on any card.
    expect(tokens).toContain("--shadow-raised: none");
  });

  it("the layout system carries the site's measured grid", () => {
    expect(tokens).toContain("--content-max: 1152px");
    expect(tokens).toContain("--grid-gutter: 32px");
    expect(tokens).toContain("--grid-columns: 12");
    expect(globals).toContain(".wla-split");
    /*
     * content-box is load-bearing: the site's 1152px is its CONTENT width with
     * gutters outside it, so a border-box container would render narrow at
     * every viewport and never line up with the public site.
     */
    /*
     * The container's max-width must include BOTH gutters, so the content
     * column is the site's 1152px with the gutters outside it. content-box
     * was the first attempt and overflowed every small screen by exactly two
     * gutters, so the guard pins the calc form specifically.
     */
    expect(globals).toContain(
      "max-width: calc(var(--content-max) + 2 * var(--gutter-mobile))",
    );
    expect(globalsCode).not.toContain("box-sizing: content-box");
  });

  it("capitals are not used to manufacture hierarchy", () => {
    /*
     * MEASURED: the public site sets uppercase in exactly one place, its 12px
     * footer group headings, and nowhere in the body of a page. Tracked-out
     * caps at label size cost legibility for an audience that includes
     * seven-year-olds.
     *
     * The status badge used to be the one exception. It is no longer set in
     * caps: text, a marker and distinct action wording already carry status
     * three times over, which is what Architecture §20 actually requires.
     *
     * Uses `code`, not `read` — this guard went green once off a comment.
     */
    const offenders: string[] = [];
    for (const file of [
      "src/components/mission/evidence-item.tsx",
      "src/components/mission/mission-status.tsx",
      "src/components/academy/mission-collection.tsx",
      "src/components/mission/screens/index.tsx",
      "src/app/(academy)/academy/missions/[missionId]/complete/page.tsx",
    ]) {
      if (code(file).includes("uppercase")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the focus indicator clears 3:1 on every surface it lands on", () => {
    /*
     * Clay on cream is 3.02:1 and fails outright on an olive button. A single
     * colour cannot work everywhere, so the ring is drawn twice: a
     * background-coloured halo, then charcoal outside it.
     */
    expect(tokens).toContain("--focus-ring:");
    expect(tokens).toContain("0 0 0 2px var(--color-background)");
    expect(tokens).toContain("0 0 0 4px var(--color-text)");
    expect(globals).toContain("box-shadow: var(--focus-ring)");
    // `outline: none` is only acceptable because a box-shadow replaces it.
    // Assert the focus block actually carries a visible indicator.
    const focusBlock = globals.slice(
      globals.indexOf(":focus-visible {"),
      globals.indexOf("}", globals.indexOf(":focus-visible {")),
    );
    expect(focusBlock).toContain("box-shadow: var(--focus-ring)");
  });

  it("the font variables are declared on the element :root refers to", () => {
    /*
     * A REGRESSION GUARD FOR A BUG THAT SHIPPED SILENTLY.
     *
     * tokens.css declares `--font-serif: var(--font-wla-serif), …` inside
     * `:root`, which is <html>. next/font's generated classes were on <body>,
     * a CHILD — so at the point of substitution --font-wla-serif was undefined,
     * --font-serif computed to the guaranteed-invalid value, and every
     * descendant inherited that invalidity. No heading in the application ever
     * rendered in Fraunces.
     *
     * Nothing we had could see it. The classes were on the element, the
     * @font-face rules were in the compiled CSS, and the font files served
     * 200 — all true, all beside the point. It took a rendered screenshot.
     *
     * This guard is the cheap half of the lesson: it pins the variables to the
     * element :root selects. It CANNOT prove the type renders, and no source
     * test can. Only a screenshot closes that gap.
     */
    const layout = code("src/app/layout.tsx");
    expect(layout).toMatch(/<html[^>]*className=\{`\$\{serif\.variable\}/);
    expect(layout).toMatch(/<body>/);
    expect(layout).not.toMatch(/<body[^>]*serif\.variable/);
    // And the reference the fix exists to satisfy is still declared on :root.
    expect(tokens).toContain("--font-serif: var(--font-wla-serif)");
    expect(tokens).toContain("--font-sans:");
  });

  it("a size token always carries the length: hint", () => {
    /*
     * A REGRESSION GUARD FOR A BUG THAT SHIPPED SILENTLY.
     *
     * `cn()` is tailwind-merge. Given two arbitrary `text-[…]` utilities it
     * cannot classify, it treats them as one group and keeps only the last.
     * The Button put its colour first and its size second, so the COLOUR was
     * dropped: the primary button rendered its label in inherited charcoal on
     * olive at 2.26:1.
     *
     * Verified against tailwind-merge itself — `length:` + a bare colour is
     * handled correctly, and so is a bare colour beside a hover colour. The
     * only combination that loses a class is bare-size + bare-colour. So this
     * guard is narrow on purpose: every SIZE token must be hinted, and then
     * the ambiguity cannot arise.
     */
    const offenders: string[] = [];
    for (const file of listSourceFiles()) {
      for (const m of code(file).matchAll(
        /text-\[var\(--text-[a-z0-9-]+\)\]/g,
      )) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Button really keeps both its colour and its size after cn()", () => {
    /*
     * The behavioural half. A source guard cannot see what tailwind-merge
     * does, and tailwind-merge is what broke the button — so this runs the
     * real `cn()` over the real composition order (variant first, size second)
     * and asserts nothing is lost.
     */
    const button = code("src/components/ui/button.tsx");
    const variant = button.match(/primary:\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
    const size = button.match(/large:\s*"([^"]+)"/)?.[1] ?? "";
    expect(variant).toContain("text-[color:");
    expect(size).toContain("text-[length:");

    const merged = cn(variant, size);
    expect(merged).toContain("text-[color:var(--color-primary-text)]");
    expect(merged).toContain("text-[length:var(--text-button)]");
  });

  it("reduced motion is still respected", () => {
    expect(tokens).toContain("prefers-reduced-motion: reduce");
  });
});

// ──────────────────────────────────────────────── For Parents document ─────
describe("the parent note document", () => {
  const assets = "supabase/seed/assets/six-names";
  /** SQL with `--` comments stripped. A guard must not match prose. */
  const sql = (p: string) => read(p).replace(/^\s*--.*$/gm, "");
  const resources = code("src/features/missions/resources.ts");
  const parentsPage = code(
    "src/app/(academy)/academy/missions/[missionId]/parents/page.tsx",
  );
  const migration = read(
    "supabase/migrations/20260927110000_parent_note_document.sql",
  );
  const seedDoc = sql("supabase/seed/six_names_parent_note_document.sql");

  it("the supplied PDF is present", () => {
    const pdf = readFileSync(join(repo, assets, "six-names-parent-note.pdf"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
  });

  it("is NOT a Mission Kit resource", () => {
    /*
     * Architecture §8 keeps For Parents separate from the Kit, and Brief §17
     * forbids the two collapsing into one "files" area. The document hangs off
     * mission_parent_notes, so it can never appear in the child's Kit list.
     */
    expect(migration).toContain("alter table mission_parent_notes");
    expect(migration).toContain("document_path");
    /*
     * Stripped of comments: this seed's own comment explains why the note is
     * NOT a mission_resources row, so a naive text match on the raw file
     * flags the very file that does the right thing.
     */
    const doc = sql("supabase/seed/six_names_parent_note_document.sql");
    expect(doc).toContain("mission_parent_notes");
    expect(doc).not.toContain("mission_resources");

    // And no Kit seed lists it among the child's printables.
    for (const seedFile of [
      "supabase/seed/six_names.sql",
      "supabase/seed/six_names_v2_kit.sql",
    ]) {
      expect(sql(seedFile)).not.toContain("six-names-parent-note.pdf");
    }
  });

  it("is served only as a short-lived signed URL from the private bucket", () => {
    // Tech Spec §47 — no permanent public URLs for mission material.
    expect(resources).toContain("getParentNoteDocumentUrl");
    expect(resources).toContain("createSignedUrl");
    expect(resources).not.toContain("getPublicUrl");
    // And never from public/, which would bypass entitlement entirely.
    expect(seedDoc).not.toContain("/public/");
    expect(existsSync(join(repo, "public/six-names-parent-note.pdf"))).toBe(
      false,
    );
  });

  it("is entitlement-gated before a URL is minted, using the caller's session", () => {
    const fn = resources.slice(resources.indexOf("getParentNoteDocumentUrl"));
    const gateAt = fn.indexOf("requireEntitledMission(");
    const signAt = fn.indexOf("createSignedUrl(");
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(signAt);
    // A service-role URL would bypass the bucket policy, which is the
    // independent second check on family ownership.
    expect(fn).not.toContain("createAdminClient");
    expect(fn).not.toContain("SERVICE_ROLE");
  });

  it("the path sits under the mission id, so the existing policy covers it", () => {
    // The bucket policy matches (storage.foldername(name))[1] against the
    // entitled mission id. A path anywhere else would be unreachable.
    expect(seedDoc).toContain("m.id || '/six-names-parent-note.pdf'");
  });

  it("For Parents redirects to the document, and falls back to the text", () => {
    expect(parentsPage).toContain("getParentNoteDocumentUrl");
    expect(parentsPage).toMatch(/if \(documentUrl\) redirect\(documentUrl\)/);
    // The text note is still rendered when there is no document.
    expect(parentsPage).toContain("<ParentNote content={home.parentNote} />");
  });

  it("redirect() is outside the try, so a redirect is never read as a failure", () => {
    /*
     * redirect() throws by design. Inside the try that loads the page it would
     * be caught and reported as "We couldn't load this note."
     */
    const tryStart = parentsPage.indexOf("try {");
    const catchEnd = parentsPage.indexOf("}", parentsPage.indexOf("} catch"));
    const redirectAt = parentsPage.indexOf("redirect(documentUrl)");
    expect(redirectAt).toBeGreaterThan(catchEnd);
    expect(redirectAt).toBeGreaterThan(tryStart);
  });
});

// ─────────────────────────────────────── Academy design: state & structure ──
describe("the collection card follows the approved anatomy", () => {
  const card = code("src/components/academy/mission-collection.tsx");
  const home = code("src/app/(academy)/academy/missions/[missionId]/page.tsx");

  it("status is never encoded in the card's SURFACE", () => {
    /*
     * The Academy once drew status into the card's background — in-progress
     * sat on sage — which made status a colour (Architecture §20) and made the
     * grid noisy. The LMS brief approved a compact bordered card (D-66), so
     * the card now HAS a border and a fill; what must not come back is that
     * border or fill VARYING by status.
     */
    expect(card).not.toMatch(/SURFACE\s*:\s*Record<MissionStatus/);
    const root = card.slice(card.indexOf("<Link"), card.indexOf("</Link>"));
    const rootClasses = root.slice(0, root.indexOf(">"));
    expect(rootClasses).not.toMatch(/item\.status|status ===/);
  });

  it("the collection card derives its action from status, never from the route", () => {
    // D-65 — the locked pairing.
    expect(card).toContain("STATUS_ACTION[item.status]");
    expect(card).toMatch(/not_started:\s*"Start Mission"/);
    expect(card).toMatch(/in_progress:\s*"Continue Mission"/);
    expect(card).toMatch(/complete:\s*"View Mission"/);
  });

  it("a completed mission is not dimmed or archived-looking", () => {
    // UI/UX §22.
    expect(card).not.toMatch(
      /complete[\s\S]{0,120}(opacity|grayscale|line-through)/,
    );
  });

  it("the card carries exactly what the brief enumerates, and no more", () => {
    /*
     * Brief §9 lists the card's contents — image, title, Lab, age range,
     * status, one action — and then says "Do not add unnecessary metadata".
     * Delivery type was on the old card and is deliberately NOT here; it still
     * appears on Mission Home, where there is room for it to mean something.
     */
    expect(card).toContain("labLabel");
    expect(card).toMatch(/Ages \{item\.minAge\}/);
    expect(card).toContain("STATUS_LABEL");
    expect(card, "delivery type is not card metadata").not.toContain("delivery_type");
    expect(home, "Mission Home still shows delivery type").toContain("MissionIdentity");
  });

  it("renders the supplied mission photograph, optimised", () => {
    /*
     * The image IS the card on the public site, so a card without one is a
     * different component. `next/image` because the grid renders up to twenty.
     */
    expect(card).toContain("next/image");
    expect(card).toContain("coverImage");
    const covers = code("src/features/missions/covers.ts");
    expect(covers).toContain("mission.cover_image");
    expect(covers).toContain("/missions/six-names.jpg");
  });

  it("the cover keeps its description when the src comes from the database", () => {
    /*
     * REGRESSION: found during staging QA. Once `cover_image` was seeded, the
     * resolver returned `alt: ""` and the photograph became undescribed on
     * staging while still described locally — the same image, silent for a
     * screen-reader user in the one environment that mattered.
     *
     * The column supplies a path, never a description, so the written one has
     * to be looked up by slug regardless of which path produced the src.
     */
    const fromDb = resolveMissionCover({
      slug: "six-names",
      title: "Six Names",
      cover_image: "/missions/six-names.jpg",
    });
    const fromMap = resolveMissionCover({
      slug: "six-names",
      title: "Six Names",
      cover_image: null,
    });
    expect(fromDb?.src).toBe("/missions/six-names.jpg");
    expect(fromDb?.alt).toBe(fromMap?.alt);
    expect(fromDb?.alt).toMatch(/kraft cards/);

    // A mission with a cover but no written description stays undescribed
    // rather than getting an invented one.
    const unknown = resolveMissionCover({
      slug: "not-a-real-mission",
      title: "X",
      cover_image: "/missions/x.jpg",
    });
    expect(unknown?.alt).toBe("");
  });

  it("does not invent artwork for missions that have none", () => {
    /*
     * The client's standing instruction: if an asset does not exist, say so
     * rather than substituting one.
     *
     * That includes a tinted stand-in. One was tried — a panel at the image's
     * aspect ratio, to hold the grid's proportions — and rejected on sight:
     * beside a real photograph it was the louder of the two, which is what a
     * placeholder that size always becomes. A mission without a cover is
     * title-led until its artwork exists.
     *
     * The cover block must therefore be a plain conditional with no else.
     */
    /*
     * Narrowed to IMAGE stand-ins. The bare word "placeholder" also matches
     * `placeholder="Search missions"`, which is an ordinary input attribute
     * and has nothing to do with inventing artwork — a guard that fails on
     * that is measuring the wrong thing.
     */
    expect(card).not.toMatch(
      /placeholderImage|fallbackImage|defaultCover|unsplash|placeholder\s*=\s*["'`](?!Search)/i,
    );
    // The cover renders only when one exists — no `else`, no tinted panel.
    expect(card).toContain("if (!src) return null;");
    expect(card).toContain("{item.coverImage && <Cover");
    // And the same on the Continue strip, which had its own 84px stand-in.
    const myMissions = code("src/app/(academy)/academy/my-missions/page.tsx");
    expect(myMissions).toContain("{i.coverImage && (");
    expect(myMissions).not.toMatch(/size-\[84px\][^>]*bg-\[var\(--color-surface-sage\)\]/);
    /*
     * Scoped to the Cover function. The rule is that the COVER has no `else`
     * branch — a blanket check over the file also catches the filtered-list
     * ternary, which is unrelated and legitimate.
     */
    const cover = card.slice(card.indexOf("function Cover("));
    expect(cover.slice(0, cover.indexOf("\n}"))).not.toContain(") : (");
  });

  it("the Lab icons are the supplied assets, not redrawn ones", () => {
    /*
     * D-39: absent assets are not substituted. These were outstanding until
     * the client supplied them on 2026-09-27; the slot was built and left
     * empty in the meantime rather than filled with a guess.
     *
     * A standalone .svg served as image/svg+xml renders nothing without the
     * namespace, which the supplied files did not carry — so that is asserted
     * too, since a missing xmlns fails silently in the browser.
     */
    // LAB_LABEL is applied on the page, which maps it into the card's props;
    // the card itself receives a resolved `labLabel`.
    expect(code("src/app/(academy)/academy/my-missions/page.tsx"))
      .toContain("LAB_LABEL[mission.lab]");
    expect(card).toContain("labLabel");

    const labs = code("src/features/missions/labs.ts");
    for (const lab of [
      "challenge",
      "decision",
      "curiosity",
      "wellbeing",
      "navigation",
    ]) {
      expect(labs).toContain(`${lab}: "/labs/${lab}.svg"`);
      const svg = read(`public/labs/${lab}.svg`);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain("<svg");
      // Drawn in the brand olive, not an arbitrary colour.
      expect(svg.toUpperCase()).toContain("#5F6A4F");
    }
    // The meta row still reads correctly without them.
  });
});

describe("Active Mission orientation", () => {
  const header = read("src/components/academy/academy-header.tsx");
  const active = read(
    "src/app/(academy)/academy/missions/[missionId]/active/page.tsx",
  );

  it("the header carries mission identity and both ways out (§35)", () => {
    expect(header).toContain("mission.title");
    expect(header).toContain("Mission Home");
    expect(header).toContain("Mission Kit");
    expect(active).toContain(
      "mission={{ title: mission.title, slug: mission.slug }}",
    );
  });

  it("that nav is not duplicated in the content area", () => {
    const body = active.slice(active.indexOf("<main"));
    expect(body).not.toContain('aria-label="Mission"');
  });

  it("identity appears only in the quiet variant", () => {
    // The standard header keeps the profile control instead.
    expect(header).toContain("{quiet && mission && (");
  });
});

describe("My Missions ordering", () => {
  const queries = read("src/features/missions/queries.ts");

  it("puts a mission already underway first", () => {
    expect(queries).toContain("in_progress: 0");
    expect(queries).toContain("not_started: 1");
    expect(queries).toContain("complete: 2");
  });

  it("is ordering only — no search or filter was introduced", () => {
    // Architecture §22 defers both until mission volume creates the need.
    for (const forbidden of ["searchTerm", "filterBy", "query:", "ilike"]) {
      expect(queries).not.toContain(forbidden);
    }
  });
});

describe("public Mission Detail exists only for a published mission", () => {
  it("asks the database for a published row and 404s otherwise", () => {
    const page = code("src/app/(public)/missions/[slug]/page.tsx");
    expect(page).toMatch(/\.eq\("published", true\)/);
    expect(page).toMatch(/if \(!mission\) notFound\(\)/);
    // the heading comes from the row, never from the URL
    expect(page).not.toMatch(/\{slug\}<\/h1>/);
  });
});

describe("a child can find their own way in (D-58)", () => {
  it("the parent sign-in page — where every Academy redirect lands — links to child sign in", () => {
    expect(code("src/app/(auth)/login/page.tsx")).toMatch(/href="\/child\/login"/);
  });
  it("the parent's code panel links to it rather than printing a path", () => {
    // Both places a code is revealed — the profile's panel and adding a child
    // (D-108) — render the one RevealedCode, which carries the link.
    const revealed = code("src/components/child/revealed-code.tsx");
    expect(revealed).toMatch(/<Link href="\/child\/login"/);
    expect(revealed).not.toMatch(/<strong>\/child\/login<\/strong>/);
    expect(code("src/components/child/child-access-panel.tsx")).toMatch(/<RevealedCode /);
    expect(code("src/components/profile/child-form.tsx")).toMatch(/<RevealedCode/);
  });
});

describe("the Academy error boundary can actually recover", () => {
  it("retries with a re-fetch (retry), not a client-only re-render (reset)", () => {
    const boundary = code("src/app/(academy)/error.tsx");
    expect(boundary).toMatch(/onRetry=\{\(\) => retry\(\)\}/);
    expect(boundary).not.toMatch(/\breset\b/);
    expect(boundary).toMatch(/as="h1"/);
  });
});

describe("the completion page only speaks to a completed mission (D-65)", () => {
  it("redirects to Mission Home unless the status is complete", () => {
    const page = code("src/app/(academy)/academy/missions/[missionId]/complete/page.tsx");
    expect(page).toMatch(/if \(home\.status !== "complete"\) redirect\(base\)/);
    // and the redirect is not inside the try, where it would be caught
    expect(page.indexOf('redirect(base)')).toBeGreaterThan(page.indexOf("throw error;"));
  });
});

describe("no page swallows its own notFound() or redirect()", () => {
  /*
   * notFound() and redirect() work by THROWING. Inside a try whose catch
   * renders an error state, the 404 became "We couldn't load this mission.
   * Please try again." (found in staging QA on Mission Home, Kit and Trail).
   * This walks every page and route file and rejects either call lexically
   * inside a try block.
   */
  const walk = (dir: string): string[] =>
    readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.(tsx?|jsx?)$/.test(d.name) ? [`${dir}/${d.name}`] : [],
    );

  function tryBodies(src: string): string[] {
    const out: string[] = [];
    let i = 0;
    while ((i = src.indexOf("try {", i)) !== -1) {
      let depth = 0, j = i + 4;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}" && --depth === 0) break;
      }
      out.push(src.slice(i, j));
      i = j;
    }
    return out;
  }

  it("keeps every notFound()/redirect() outside try blocks in src/app", () => {
    const offenders: string[] = [];
    for (const f of walk("src/app")) {
      for (const body of tryBodies(code(f))) {
        if (/\b(notFound|redirect)\(/.test(body)) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("a signed-out visitor to My Missions is sent to a way back in", () => {
  it("redirects to child or parent sign-in instead of a dead-end message", () => {
    const page = code("src/app/(academy)/academy/my-missions/page.tsx");
    expect(page).toMatch(/redirect\(\(await getChildToken\(\)\) \? "\/child\/login" : "\/login\?next=\/academy\/my-missions"\)/);
    expect(page).not.toMatch(/Please sign in to see your missions/);
  });
});

describe("Mission Board placement (Architecture §16 as amended, D-73)", () => {
  it("is linked beneath the collection on My Missions, not from Mission Home", () => {
    const myMissions = code("src/app/(academy)/academy/my-missions/page.tsx");
    const home = code("src/app/(academy)/academy/missions/[missionId]/page.tsx");
    expect(myMissions.indexOf('href="/academy/mission-board"')).toBeGreaterThan(myMissions.indexOf("<MissionCollection"));
    expect(home).not.toMatch(/\/academy\/mission-board/);
  });
});

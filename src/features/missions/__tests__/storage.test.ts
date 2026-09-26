import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "../../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");

const kit = read("src/features/missions/resources.ts");
const trail = read("src/features/mission-trail/queries.ts");
const init = read("supabase/migrations/20260925220000_init.sql");
const kitPage = read("src/app/(academy)/academy/missions/[missionId]/kit/page.tsx");
const trailPage = read("src/app/(academy)/academy/missions/[missionId]/trail/page.tsx");
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

  it("the Kit page no longer hard-codes url={null}", () => {
    expect(kitPage).not.toContain("url={null}");
    expect(kitPage).toContain("getMissionKit");
  });

  it("the bucket is private and entitlement-scoped in RLS", () => {
    expect(init).toContain("('mission-resources', 'mission-resources', false)");
    expect(init).toContain('create policy "entitled families read mission resources"');
    expect(init).toContain("e.mission_id::text = (storage.foldername(name))[1]");
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
    expect(evidenceItem).toContain('isPhysical ? "You keep this" : "Saved here"');
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
    for (const f of ["src/features/missions/resources.ts", "src/features/mission-trail/queries.ts"]) {
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
      LoadingState: ["src/app/(academy)/loading.tsx", "src/app/account/loading.tsx"],
      RestoringState: ["src/app/(academy)/academy/missions/[missionId]/active/loading.tsx"],
      ErrorState: ["src/app/(academy)/error.tsx"],
      UnavailableState: ["src/app/(academy)/academy/missions/[missionId]/kit/page.tsx"],
    };
    for (const [component, files] of Object.entries(wiring)) {
      expect(states, `${component} must exist`).toContain(`export function ${component}`);
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
    const kitPage = read("src/app/(academy)/academy/missions/[missionId]/kit/page.tsx");
    expect(kitPage).toContain("No materials for this mission");
    expect(kitPage).toContain("aren't available right now");
    expect(kitPage).toContain("kit.every((item) => item.url === null)");
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

  it("every Academy page renders exactly one chrome", () => {
    for (const page of pages) {
      const body = read(page);
      const usages = body.match(/<AcademyChrome[^>]*\/>/g) ?? [];
      expect(usages, page).toHaveLength(1);
    }
  });

  it("only Active Mission uses the quiet variant", () => {
    for (const page of pages) {
      const quiet = read(page).includes('variant="quiet"');
      expect(quiet, page).toBe(page.includes("/active/"));
    }
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

  it("the Child Mission PDF is NOT fabricated", () => {
    /*
     * OPEN-13 — the Child Mission document has never been supplied. Its
     * resource row stays, its file stays absent, and the Kit renders that one
     * entry as unavailable. Substituting generated content would misrepresent
     * approved mission material.
     */
    expect(() => readFileSync(join(assetDir, "six-names-child-mission.pdf"))).toThrow();
    // The row is still seeded, so the Kit lists it honestly.
    expect(seed).toContain("'six-names-child-mission.pdf'");
    expect(seed).toContain("'Child Mission'");
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

  it("the type scale stays pinned to the two measured values", () => {
    // Everything else follows a ratio; these two came off the approved design.
    expect(tokens).toContain("--text-body: 1.125rem"); // 18px
    expect(tokens).toContain("--text-h2: 1.875rem"); // 30px
  });

  it("capitals are not used to manufacture hierarchy", () => {
    /*
     * All-caps is harder to read at small sizes and is a generic UI tell. The
     * only remaining use is the mission status badge, which UI/UX §23 itself
     * shows in caps as its example of not relying on colour alone.
     */
    const offenders: string[] = [];
    for (const file of [
      "src/components/mission/evidence-item.tsx",
      "src/components/mission/screens/index.tsx",
      "src/app/(academy)/academy/missions/[missionId]/complete/page.tsx",
    ]) {
      if (read(file).includes("uppercase")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
    // The spec-anchored one stays.
    expect(read("src/components/mission/mission-status.tsx")).toContain("uppercase");
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

  it("reduced motion is still respected", () => {
    expect(tokens).toContain("prefers-reduced-motion: reduce");
  });
});

// ─────────────────────────────────────── Academy design: state & structure ──
describe("the mission card encodes state structurally", () => {
  const card = read("src/components/mission/mission-card.tsx");

  it("in progress is the only card on a sage surface", () => {
    /*
     * Architecture §4 — My Missions must answer "where do I continue?".
     * Three identical cards leave that to be read; the surface answers it.
     * UI/UX §7's "occasional Sage surfaces" is spent here and nowhere else.
     */
    expect(card).toContain("in_progress: \"border-[var(--color-primary)] bg-[var(--color-surface-sage)]\"");
    expect(card).toContain("not_started: \"border-[var(--color-border-strong)] bg-[var(--color-surface)]\"");
    expect(card).toContain("complete: \"border-[var(--color-border)] bg-[var(--color-surface)]\"");
  });

  it("surface is never the ONLY carrier of status", () => {
    // Architecture §20 — status must not depend on colour alone.
    expect(card).toContain("MissionStatusBadge");
    expect(card).toContain("STATUS_ACTION[status]");
  });

  it("a completed mission is not dimmed or archived-looking", () => {
    // UI/UX §22.
    expect(card).not.toMatch(/complete[\s\S]{0,120}(opacity|grayscale|line-through)/);
  });

  it("shows delivery type in the meta, as §21 requires", () => {
    expect(card).toContain("mission.delivery_type");
    // Joined into the existing dot-separated meta, not added as a new line.
    expect(card).toContain('.join(" · ")');
  });

  it("mission imagery is left out rather than faked", () => {
    // cover_image is null everywhere; no placeholder stands in for it.
    expect(card).not.toContain("<img");
    expect(card).not.toMatch(/placeholder|fallbackImage|defaultCover/i);
  });
});

describe("Active Mission orientation", () => {
  const header = read("src/components/academy/academy-header.tsx");
  const active = read("src/app/(academy)/academy/missions/[missionId]/active/page.tsx");

  it("the header carries mission identity and both ways out (§35)", () => {
    expect(header).toContain("mission.title");
    expect(header).toContain("Mission Home");
    expect(header).toContain("Mission Kit");
    expect(active).toContain("mission={{ title: mission.title, slug: mission.slug }}");
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

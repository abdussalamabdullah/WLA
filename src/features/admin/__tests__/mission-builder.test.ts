import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { screenConfigByType, completionRule } from "@/features/mission-engine/schemas";
import { screenCatalog } from "@/features/mission-engine/interactions/catalog";
import { libraryTypes } from "@/features/mission-engine/interactions/schemas";

const repo = join(__dirname, "../../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
/** SQL with `--` comments stripped: a guard must not be satisfied by prose. */
const sql = (p: string) => read(p).replace(/^\s*--.*$/gm, "");
/** Source with comments stripped: a guard must not be satisfied by prose. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
const migrations = join(repo, "supabase/migrations");
const allSql = () =>
  readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => sql(`supabase/migrations/${f}`))
    .join("\n");

/*
 * These are SOURCE guards, and the limits of that are known in this codebase:
 * they prove a rule is PRESENT, never that it BEHAVES. The behavioural proof
 * for every rule below is executed against a real PostgreSQL cluster — see
 * scripts/security-regression.sql. Both exist because the source guard catches
 * a rule being deleted, and the execution catches it being wrong.
 */

describe("mission builder authors only what the engine can render (D-56)", () => {
  it("offers no screen type the engine has no schema for", () => {
    const offered = screenCatalog.map((e) => e.type);

    expect(offered.length).toBeGreaterThan(0);
    for (const type of offered) {
      expect(Object.keys(screenConfigByType)).toContain(type);
    }
  });

  it("offers every screen type the engine CAN render, so authoring is not silently narrower", () => {
    const offered = new Set(screenCatalog.map((e) => e.type));
    for (const type of Object.keys(screenConfigByType)) {
      expect(offered).toContain(type);
    }
    const editor = read("src/components/admin/screen-editor.tsx");
    expect(editor).toContain("screenCatalog");
  });

  it("every starter template parses against its own engine schema", () => {
    expect(screenCatalog.length).toBe(Object.keys(screenConfigByType).length);
    for (const { type, template } of screenCatalog) {
      const schema = screenConfigByType[type];
      expect(schema, `no schema for ${type}`).toBeDefined();
      // Built-in starters may have blanks a real screen would fill in; what
      // must hold is that their SHAPE is the schema's shape. Library starters
      // are complete examples and must parse as they stand.
      const result = schema.safeParse(template);
      if (!result.success) {
        expect(libraryTypes as string[], `${type}: ${result.error.issues[0]?.message}`).not.toContain(type);
        const onlyEmptyStrings = result.error.issues.every(
          (i) => i.code === "too_small" || i.message.toLowerCase().includes("expected"),
        );
        expect(onlyEmptyStrings, `${type}: ${result.error.issues[0]?.message}`).toBe(true);
      }
    }
  });

  it("the save action validates configuration with the engine's own schemas", () => {
    const actions = read("src/features/admin/builder-actions.ts");
    expect(actions).toContain("screenConfigByType[type");
    expect(actions).toContain("schema.safeParse");
    // and the completion rule with the engine's rule schema
    expect(actions).toContain("completionRule.safeParse");
  });

  it("rejects a configuration the engine could not render", () => {
    // A choice with an option missing its destination.
    const bad = { options: [{ id: "a", label: "A" }] };
    expect(screenConfigByType.choice.safeParse(bad).success).toBe(false);
  });

  it("rejects a completion rule that is not one of the known kinds", () => {
    expect(completionRule.safeParse({ type: "whenever" }).success).toBe(false);
    expect(
      completionRule.safeParse({ type: "screen_reached", screenKey: "done" }).success,
    ).toBe(true);
  });
});

describe("published versions are immutable in the DATABASE, not the editor (D-57)", () => {
  it("a trigger guards mission_screens for insert, update AND delete", () => {
    const s = allSql();
    expect(s).toMatch(/create trigger mission_screens_immutable/);
    expect(s).toMatch(
      /before insert or update or delete on mission_screens/,
    );
  });

  it("the guard refuses published and archived alike", () => {
    const s = sql("supabase/migrations/20260929100000_mission_versions.sql");
    expect(s).toMatch(/v_status in \('published', 'archived'\)/);
  });

  it("publishing re-runs validation inside the same function", () => {
    const s = sql("supabase/migrations/20260929100000_mission_versions.sql");
    expect(s).toMatch(/from validate_mission_version\(p_mission_id, p_version\)/);
    expect(s).toMatch(/validation_failed/);
  });

  it("no authoring function may touch a version that is not draft or in review", () => {
    const s = sql("supabase/migrations/20260929100400_mission_authoring.sql");
    expect(s).toMatch(/v_status not in \('draft', 'in_review'\)/);
    for (const fn of [
      "admin_upsert_screen",
      "admin_delete_screen",
      "admin_move_screen",
      "admin_set_completion_rule",
    ]) {
      const body = s.slice(s.indexOf(`create or replace function ${fn}(`));
      expect(
        body.slice(0, body.indexOf("$$;")),
        `${fn} does not assert an editable version`,
      ).toMatch(/assert_editable_version/);
    }
  });

  it("mission_screens still has NO surviving client policy (D-52 stays closed)", () => {
    /*
     * Two policies were created historically and both were later dropped —
     * "screens require entitlement" (by the screen_access migration) and
     * "admins manage mission screens" (by D-52, after a live test showed an
     * admin could read all 48 rows including concealed Evidence).
     *
     * So the invariant is not "none was ever written", it is "none survives".
     * A new migration that adds one and forgets to drop it fails here.
     */
    const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
    const created = new Set<string>();
    for (const f of files) {
      const body = sql(`supabase/migrations/${f}`);
      for (const m of body.matchAll(/create policy\s+"([^"]+)"\s+on\s+mission_screens/gi)) {
        created.add(m[1]);
      }
      for (const m of body.matchAll(/drop policy\s+(?:if exists\s+)?"([^"]+)"\s+on\s+mission_screens/gi)) {
        created.delete(m[1]);
      }
    }
    expect([...created], "a policy on mission_screens survives all migrations").toEqual([]);
  });

  it("the builder cannot READ a published version's screens either (D-52)", () => {
    /*
     * admin_draft_screens shipped with this rule in its comment and not in its
     * code, so an admin could read Six Names v2 — including the concealed
     * Evidence body — through the builder. Found by the executed regression.
     */
    const s = sql("supabase/migrations/20260929100000_mission_versions.sql");
    const from = s.indexOf("create or replace function admin_draft_screens");
    const body = s.slice(from, s.indexOf("$$;", from));
    expect(body).toMatch(/v_status not in \('draft', 'in_review'\)/);
    expect(body).toMatch(/version_not_editable/);
  });

  it("D-17 is untouched: start_mission still pins the version onto the run", () => {
    const s = allSql();
    expect(s).toMatch(/mission_version = mission_progress\.mission_version/);
  });
});

describe("mission deletion is refused while learner records exist (§17)", () => {
  it("counts entitlements, runs, evidence and orders before deleting", () => {
    const s = sql("supabase/migrations/20260929100300_admin_lms.sql");
    const fn = s.slice(s.indexOf("create or replace function delete_mission_if_unused"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    for (const t of [
      "mission_entitlements",
      "mission_progress",
      "mission_evidence",
      "checkout_intents",
    ]) {
      expect(body, `${t} is not checked before deletion`).toContain(t);
    }
    expect(body).toContain("mission_has_learner_records");
  });
});

describe("admin surfaces are admin-only at the database (§18–§23)", () => {
  it("every admin_* function begins by refusing a non-admin", () => {
    const s = sql("supabase/migrations/20260929100300_admin_lms.sql");
    const fns = [...s.matchAll(/create or replace function (admin_[a-z_]+)\(/g)].map(
      (m) => m[1],
    );
    expect(fns.length).toBeGreaterThanOrEqual(6);
    for (const fn of fns) {
      const from = s.indexOf(`create or replace function ${fn}(`);
      const body = s.slice(from, s.indexOf("$$;", from));
      expect(body, `${fn} does not check is_admin()`).toMatch(/if not is_admin\(\)/);
    }
  });

  it("orders are read-only — no function writes an entitlement from the admin", () => {
    const s = sql("supabase/migrations/20260929100300_admin_lms.sql");
    expect(s).not.toMatch(/insert into mission_entitlements/i);
  });
});

describe("the learner Preview is the real engine, writing nothing (§6)", () => {
  const preview = () => read("src/components/admin/mission-preview.tsx");

  it("drives the SAME renderer and the SAME runtime a learner gets, not copies", () => {
    const p = preview();
    expect(p).toContain("MissionScreenRenderer");
    // The server's own transition and initialisation (runtime.ts) and the
    // server's own projection — what a child's browser actually receives.
    for (const fn of ["startRun(", "step(", "projectScreen(", "clientState("]) {
      expect(p, `preview must use ${fn}`).toContain(fn);
    }
    const server = code("src/features/mission-engine/persistence.ts");
    for (const fn of ["startRun(", "step(", "projectCurrent("]) {
      expect(server, `server must use ${fn}`).toContain(fn);
    }
  });

  it("creates no progress, no entitlement and no analytics", () => {
    const p = code("src/components/admin/mission-preview.tsx");
    for (const forbidden of [
      "start_mission",
      "persist_mission_state",
      "complete_mission",
      "mission_entitlements",
      "record_mission_event",
      "recordInteractionAction",
      "recordEvent",
    ]) {
      expect(p, `preview must not call ${forbidden}`).not.toContain(forbidden);
    }
    // No server action, no fetch, no supabase client at all.
    expect(p).not.toMatch(/"use server"/);
    expect(p).not.toMatch(/\bfetch\(/);
    expect(p).not.toMatch(/createClient|supabase\./);
  });

  it("re-implements no engine step of its own", () => {
    const p = preview();
    for (const fn of ["applyInteraction(", "applyCanonicalTracker(", "resolveNextScreen(", "isMissionComplete("]) {
      expect(p, `${fn} belongs to the runtime`).not.toContain(fn);
    }
  });

  it("refuses to preview a published or archived version", () => {
    const route = code(
      "src/app/admin/builder/[slug]/[version]/preview/page.tsx",
    );
    expect(route).toMatch(/status !== "draft" && .*status !== "in_review"/);
    expect(route).toContain("notFound()");
    // and it reads screens only through the draft-only function
    expect(route).toContain("adminDraftScreens");
  });

  it("says it is a preview, and that nothing is saved", () => {
    const p = preview();
    expect(p).toContain("Preview");
    expect(p).toContain("nothing here");
  });
});

describe("draft Kit files and the parent note preview (D-68)", () => {
  it("signs draft files with the admin's own session, never the service role", () => {
    const q = code("src/features/admin/lms-queries.ts");
    const fn = q.slice(q.indexOf("export async function signDraftFiles"));
    expect(fn).toContain("requireAdmin()");
    expect(fn).not.toMatch(/createAdminClient|supabase\/admin|SERVICE_ROLE/);
  });

  it("signs only paths the draft-only functions returned", () => {
    const page = code("src/app/admin/builder/[slug]/[version]/page.tsx");
    expect(page).toMatch(/signDraftFiles\(\[\s*\.\.\.resources\.map/);
    // resources are only fetched for an editable version
    expect(page).toMatch(/editable \? adminDraftResources/);
  });

  it("previews the parent note through the component For Parents renders", () => {
    const editor = code("src/components/admin/kit-editor.tsx");
    expect(editor).toContain('from "@/components/academy/parent-note"');
    expect(editor).toMatch(/<ParentNote content=\{text/);
  });

  it("keeps Kit files out of reach of families until released, in the database", () => {
    const all = allSql();
    expect(all).toMatch(/for select to authenticated using \([\s\S]*?private\.mission_file_released\(bucket_id, name\)/);
    expect(all).toMatch(/drop policy if exists "admins update mission resources" on storage\.objects;/);
    expect(all).toMatch(/and not private\.mission_file_released\(bucket_id, name\)/);
  });
});

describe("every screen template can actually be saved once filled in", () => {
  /*
   * Found in acceptance QA: 9 of 12 templates omitted required fields or used
   * names the schema does not have (a decision had no `prompt`, completion no
   * `message`, tracker used `rows` for `dimensions`), so an author got errors
   * for fields the editor never showed them. This fills every blank and
   * parses — it is the schema, not a copy of it, that decides.
   */
  const offered = screenCatalog.map((e) => e.type);

  it("has a template for every screen type the editor offers", () => {
    expect(new Set(offered).size).toBe(offered.length);
    expect([...offered].sort()).toEqual(Object.keys(screenConfigByType).sort());
  });

  for (const { type, template } of screenCatalog) {
    it(`${type}: filled template passes the engine schema`, () => {
      const filled = JSON.parse(JSON.stringify(template).replace(/""/g, '"x"'));
      const result = screenConfigByType[type].safeParse(filled);
      expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
    });
  }
});

describe("builder forms that can be open together never share element ids", () => {
  it("the Kit resource form's ids are unique, not the screen editor's literals", () => {
    const kit = code("src/components/admin/kit-editor.tsx");
    const resourceForm = kit.slice(kit.indexOf("function ResourceForm("), kit.indexOf("function MoveResource("));
    const screen = code("src/components/admin/screen-editor.tsx");
    const screenIds = [...screen.matchAll(/\bid="([a-z_]+)"/g)].map((m) => m[1]);
    const literalIds = [...resourceForm.matchAll(/\bid="([a-z_]+)"/g)].map((m) => m[1]);
    expect(screenIds.length).toBeGreaterThan(0);
    expect(literalIds.filter((i) => screenIds.includes(i))).toEqual([]);
    expect(resourceForm).toMatch(/useId\(\)/);
  });
});

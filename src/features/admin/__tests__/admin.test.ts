import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { missionCatalogueSchema } from "../schemas";
import { redact } from "@/lib/observability/logger";

const repo = join(__dirname, "../../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
/** SQL with `--` comments stripped: a guard must not be satisfied by prose. */
const sql = (p: string) => read(p).replace(/^\s*--.*$/gm, "");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const valid = {
  title: "Six Names",
  description: "A list appears.",
  lab: "decision" as const,
  min_age: 11,
  max_age: 15,
  duration: "60–75 mins",
  delivery_type: "hybrid" as const,
  price_minor: 1200,
  currency: "GBP",
  cover_image: "/missions/six-names.jpg",
  is_free: false,
  published: false,
};

// ─────────────────────────────────────────── the editable content boundary ──

describe("CMS-01 — the editable content boundary", () => {
  it("accepts the fields the requirements name as editable", () => {
    expect(missionCatalogueSchema.safeParse(valid).success).toBe(true);
  });

  it("CANNOT write slug, version, completion_rule or is_admin", () => {
    /*
     * The schema IS the boundary: a field absent from it cannot be reached by
     * a crafted form post either, because the action builds its update from
     * the parsed result and never from formData directly.
     *
     *   slug            — the permanent address families already hold
     *   version         — D-17; editing it would re-point live runs
     *   completion_rule — mission logic, not catalogue content
     *   is_admin        — not content at all
     */
    const parsed = missionCatalogueSchema.parse({
      ...valid,
      slug: "hijacked",
      version: 99,
      completion_rule: { type: "screen_reached", screenKey: "complete" },
      is_admin: true,
    } as never);

    for (const forbidden of [
      "slug",
      "version",
      "completion_rule",
      "is_admin",
    ]) {
      expect(parsed).not.toHaveProperty(forbidden);
    }
  });

  it("the save action updates only parsed fields, never raw form data", () => {
    const action = code("src/features/admin/actions.ts");
    // Every column written comes off the parsed object.
    const update = action.slice(
      action.indexOf(".update({"),
      action.indexOf('.eq("slug"'),
    );
    expect(update).not.toMatch(/formData\.get/);
    for (const forbidden of [
      "slug:",
      "version:",
      "completion_rule:",
      "is_admin:",
    ]) {
      expect(update).not.toContain(forbidden);
    }
  });

  it("there is no mission-screen editor anywhere in the admin", () => {
    // Tech Spec §18 — "We are not building a no-code mission builder."
    for (const file of [
      "src/features/admin/actions.ts",
      "src/features/admin/schemas.ts",
      "src/features/admin/queries.ts",
      "src/components/admin/mission-form.tsx",
    ]) {
      expect(code(file)).not.toContain("mission_screens");
    }
  });

  it("rejects an age range that runs backwards", () => {
    const r = missionCatalogueSchema.safeParse({
      ...valid,
      min_age: 15,
      max_age: 11,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a mission that is both free and priced", () => {
    // Otherwise `acquireMission` cannot say which path a child took, and the
    // entitlement source stops meaning anything.
    const r = missionCatalogueSchema.safeParse({
      ...valid,
      is_free: true,
      price_minor: 1200,
    });
    expect(r.success).toBe(false);
  });

  it("every admin entry point requires an admin", () => {
    for (const file of [
      "src/features/admin/queries.ts",
      "src/features/admin/actions.ts",
    ]) {
      const src = code(file);
      const exported = src.match(/export async function \w+/g) ?? [];
      expect(exported.length).toBeGreaterThan(0);
      expect(src).toContain("requireAdmin");
    }
    // And the route group refuses before any child page renders.
    expect(code("src/app/admin/layout.tsx")).toContain("requireAdmin");
  });
});

describe('every "use server" module exports only async functions', () => {
  it("holds across the whole codebase", () => {
    /*
     * REGRESSION. `actions.ts` exported `emptyAdminState`, an object. A
     * `"use server"` module may export only async functions, so importing it
     * threw at module evaluation and took down the entire editor PAGE — not
     * just the save. Typecheck, lint and the unit suite were all green; the
     * 500 only appeared when a real browser posted the form.
     *
     * The type export was fine, because types are erased. The value was not.
     */
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const raw = read(file);
      if (!/^\s*["']use server["']/.test(raw)) continue;
      for (const m of raw.matchAll(
        /^export\s+(?!async\s+function)(?!type\b)(?!interface\b)(\w+)/gm,
      )) {
        offenders.push(`${file}: export ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ────────────────────────────────────────────── privilege escalation fix ──

describe("is_admin is not self-service", () => {
  const migration = sql("supabase/migrations/20260928100100_lock_is_admin.sql");

  it("withdraws the table-level UPDATE before granting columns", () => {
    /*
     * A column-level REVOKE is a NO-OP while a table-level GRANT UPDATE
     * exists — the table grant already implies every column. That is why the
     * first attempt at this migration silently changed nothing.
     */
    const revokeAt = migration.indexOf("revoke update on profiles");
    const grantAt = migration.indexOf("grant update (name, email) on profiles");
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);
    expect(migration).not.toMatch(/revoke update \(is_admin\)/);
  });

  it("the trigger is NOT security definer", () => {
    /*
     * Inside a definer function `current_user` is the function OWNER, so the
     * check would compare postgres against postgres and never fire. This is
     * the exact bug the first version had.
     */
    const fn = migration.slice(
      migration.indexOf("function reject_is_admin_change"),
      migration.indexOf("drop trigger"),
    );
    expect(fn).not.toContain("security definer");
    expect(fn).toContain("current_user in ('authenticated', 'anon')");
    expect(fn).toContain("is distinct from old.is_admin");
  });

  it("no application code ever WRITES is_admin", () => {
    /*
     * Looks for the flag inside an actual write call, not merely for the word.
     * `src/types/database.ts` declares `is_admin: boolean` as part of the row
     * type, which is correct and necessary — a guard that flagged that would
     * be flagging the schema for describing the column.
     */
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const src = code(file);
      for (const m of src.matchAll(/\.(update|insert|upsert)\s*\(/g)) {
        // Take the call's argument span by balancing parentheses.
        let depth = 0;
        let i = m.index! + m[0].length - 1;
        const start = i;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        if (src.slice(start, i).includes("is_admin")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Every .ts/.tsx under a directory, excluding tests. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(repo, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "__tests__") out.push(...sourceFiles(rel));
    } else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe("an administrator cannot alter mission identity or logic", () => {
  const migration = sql(
    "supabase/migrations/20260928100300_scope_admin_mission_writes.sql",
  );

  it("the blanket `for all` policy on missions is replaced", () => {
    /*
     * REGRESSION. `admins manage missions` was `for all`, so a direct API call
     * could PATCH any column — including `version`. A live check set it to 99.
     *
     * D-17 pins a run to `missions.version` at start, so a version with no
     * screens makes every NEW run unplayable while runs already in progress
     * carry on, which is exactly what would delay anyone noticing. `for all`
     * also allowed DELETE, which cascades to entitlements and progress.
     */
    expect(migration).toContain(
      'drop policy if exists "admins manage missions" on missions',
    );
    expect(migration).toContain('create policy "admins read all missions"');
    expect(migration).toContain('create policy "admins update missions"');
    // No insert or delete policy is created.
    expect(migration).not.toMatch(
      /create policy[^;]*for insert[^;]*on missions/i,
    );
    expect(migration).not.toMatch(
      /create policy[^;]*for delete[^;]*on missions/i,
    );
  });

  it("writes are granted column by column, never table-wide", () => {
    // Postgres checks column privileges BEFORE row-level security, so this is
    // what actually refuses a write to `version`. Same mechanism as D-49.
    const revokeAt = migration.indexOf("revoke update on missions");
    const grantAt = migration.indexOf("grant update (");
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);

    const granted = migration.slice(
      grantAt,
      migration.indexOf("on missions to authenticated"),
    );
    for (const forbidden of [
      "slug",
      "version",
      "completion_rule",
      " id",
      "created_at",
    ]) {
      expect(granted).not.toContain(forbidden);
    }
    for (const allowed of [
      "title",
      "description",
      "price_minor",
      "published",
    ]) {
      expect(granted).toContain(allowed);
    }
  });

  it("the granted columns match the editor's own schema", () => {
    /*
     * The database and the form must agree about what "editable" means. If
     * they drift, one of them is wrong — and the database is the one that
     * matters, because a direct API call never touches the form.
     */
    const granted = migration
      .slice(
        migration.indexOf("grant update ("),
        migration.indexOf("on missions to authenticated"),
      )
      .replace(/grant update \(|\)/g, "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .filter((c) => c !== "updated_at");

    const schema = code("src/features/admin/schemas.ts");
    for (const column of granted) {
      expect(schema).toContain(column);
    }
  });
});

describe("an administrator cannot bypass mission gating", () => {
  const migration = sql(
    "supabase/migrations/20260928100200_admins_cannot_read_screens.sql",
  );

  it("the admin read policy on mission_screens is removed", () => {
    /*
     * REGRESSION. 0002 gave admins `for all using (is_admin())` on
     * mission_screens, written before "editable content" had been scoped.
     * A live check found it returned all 48 rows to an admin — including
     * `evidence` with its revealed body — reopening the exact door 0007 shut.
     *
     * The internal admin edits the catalogue and cannot reach screens (D-48,
     * Tech Spec §18), and screens are authored by migrations and seeds that
     * run as the table owner. So the policy granted only the leak.
     */
    expect(migration).toContain(
      'drop policy if exists "admins manage mission screens" on mission_screens',
    );
  });

  it("no migration re-creates a client read path to mission_screens", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(join(repo, "supabase/migrations"))) {
      const src = sql(`supabase/migrations/${f}`);
      // 0001 legitimately creates then 0007 drops the original policy; only a
      // policy created AFTER the screen_access migration would be a regression.
      if (f <= "20260925220600_screen_access.sql") continue;
      if (/create policy[^;]*on mission_screens/i.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("the catalogue, resource and parent-note policies are deliberately kept", () => {
    // Those carry no concealed content, and an editor needs them.
    const editable = sql(
      "supabase/migrations/20260925220100_editable_content.sql",
    );
    expect(editable).toContain('create policy "admins manage missions"');
    expect(editable).toContain(
      'create policy "admins manage mission resources"',
    );
    expect(editable).toContain('create policy "admins manage parent notes"');
  });
});

// ─────────────────────────────────────────────────────── ANALYTICS-01 ──────

describe("analytics collects no child information", () => {
  const migration = sql(
    "supabase/migrations/20260928100000_analytics_and_admin_stats.sql",
  );
  const events = code("src/lib/analytics/events.ts");

  it("the table stores no identifier that reaches a child", () => {
    const create = migration.slice(
      migration.indexOf("create table if not exists analytics_events"),
      migration.indexOf("create index"),
    );
    for (const column of [
      "child_id",
      "progress_id",
      "parent_id",
      "screen_key",
      "response",
    ]) {
      expect(create).not.toContain(column);
    }
    // What it does store.
    for (const column of [
      "name",
      "mission_id",
      "mission_version",
      "occurred_at",
    ]) {
      expect(create).toContain(column);
    }
  });

  it("the child id is an authorisation input that is then discarded", () => {
    const fn = migration.slice(
      migration.indexOf("function record_mission_event"),
      migration.indexOf("revoke all on function record_mission_event"),
    );
    // It is used for the chain…
    expect(fn).toContain("not_your_child");
    expect(fn).toContain("not_entitled");
    // …and the insert lists only non-identifying columns.
    const insert = fn.slice(fn.indexOf("insert into analytics_events"));
    expect(insert).not.toContain("p_child_id");
  });

  it("analytics_events has RLS on and no client policy", () => {
    expect(migration).toContain(
      "alter table analytics_events enable row level security",
    );
    expect(migration).not.toMatch(/create policy[^;]*on analytics_events/);
  });

  it("a failed analytics write never throws into a mission flow", () => {
    expect(events).toContain("try {");
    expect(events).toContain("catch");
    // No rethrow anywhere in the function.
    expect(events).not.toMatch(/throw\s/);
  });

  it("admin stats refuse a non-admin and derive drop-off rather than tracking it", () => {
    const fn = migration.slice(
      migration.indexOf("function admin_mission_stats"),
    );
    expect(fn).toContain("if not is_admin()");
    expect(fn).toContain("raise exception 'not_admin'");
    expect(fn).toContain("last_activity_at <");
    // Conflict C7 — there is no drop-off EVENT.
    expect(migration).not.toContain("mission_drop_off");
  });
});

// ───────────────────────────────────────────────────────────── OPS-01 ──────

describe("error logging never leaks", () => {
  it("redacts anything that looks like a credential", () => {
    const out = redact({
      apiKey: "sk_live_abc",
      authorization: "Bearer xyz",
      session_token: "t",
      signature: "s",
    }) as Record<string, string>;
    for (const v of Object.values(out)) expect(v).toBe("[redacted]");
  });

  it("keeps an event name and an error name, which are not identity", () => {
    /*
     * A bare `name` used to match the content pattern, so `error.name` and the
     * analytics event name were both logged as `[omitted]`. Over-redaction is
     * the safe direction but it is not free: it cost the two fields most
     * useful for working out what actually failed.
     */
    const out = redact({
      name: "mission_started",
      error: { name: "TypeError" },
    }) as Record<string, unknown>;
    expect(out.name).toBe("mission_started");
    expect((out.error as Record<string, string>).name).toBe("TypeError");
  });

  it("omits a child's own words and identity", () => {
    const out = redact({
      displayName: "Sofiyyah",
      childName: "Sofiyyah",
      parent_name: "A Parent",
      response: "I stand by both",
      reflection: "because…",
      email: "a@b.test",
    }) as Record<string, string>;
    for (const v of Object.values(out)) expect(v).toBe("[omitted]");
  });

  it("redacts a signed URL rather than logging the grant", () => {
    const url =
      "https://x.supabase.co/storage/v1/object/sign/a/b.pdf?token=eyJ";
    expect(redact(url)).toBe("[redacted-url]");
  });

  it("truncates long strings so a payload cannot be dumped wholesale", () => {
    const out = redact("x".repeat(500)) as string;
    expect(out.length).toBeLessThan(260);
    expect(out).toContain("[+300]");
  });

  it("the client bridge accepts a boundary and a digest, and nothing else", () => {
    /*
     * An endpoint that writes caller-supplied text into the log is a way to
     * forge entries and to bury real ones.
     */
    const route = code("src/app/api/log/route.ts");
    expect(route).toMatch(/\/\^\[a-z-\]\{1,40\}\$\//);
    expect(route).toMatch(/\/\^\[A-Za-z0-9\]\{1,64\}\$\//);
    expect(route).not.toContain("body.message");
    expect(route).not.toContain("body.stack");
  });

  it("the logger is server-only", () => {
    expect(read("src/lib/observability/logger.ts")).toContain(
      'import "server-only"',
    );
  });
});

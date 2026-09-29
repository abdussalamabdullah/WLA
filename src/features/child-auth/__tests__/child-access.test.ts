import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "../../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const sql = (p: string) => read(p).replace(/^\s*--.*$/gm, "");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const childAccess = () => sql("supabase/migrations/20260929100100_child_access.sql");
const childMission = () => sql("supabase/migrations/20260929100200_child_mission_access.sql");

describe("child access codes are never stored in plaintext (D-58)", () => {
  it("the code is hashed with bcrypt, not merely digested", () => {
    expect(childAccess()).toMatch(/crypt\(normalize_child_code\(v_code\), gen_salt\('bf'/);
  });

  it("the equality-searchable column is a KEYED digest, not a bare hash", () => {
    const s = childAccess();
    expect(s).toMatch(/hmac\(normalize_child_code\(p_code\), v_pepper, 'sha256'\)/);
  });

  it("the pepper lives outside the credential table and is unreachable by API roles", () => {
    const s = childAccess();
    expect(s).toMatch(/create table if not exists app_secrets/);
    expect(s).toMatch(
      /revoke all on table app_secrets from public, anon, authenticated, service_role/,
    );
    // and no policy grants it back
    expect(s).not.toMatch(/create policy[^;]+on app_secrets/i);
  });

  it("a parent can never select the hash columns", () => {
    const s = childAccess();
    const grant = s.match(/grant select \(([^)]*)\)\s*\n?\s*on child_access_credentials/);
    expect(grant, "no column-level grant found").toBeTruthy();
    expect(grant![1]).not.toContain("code_hash");
    expect(grant![1]).not.toContain("code_lookup");
  });

  it("the generated type agrees with the grant — no hash column is even expressible", () => {
    const types = read("src/types/database.ts");
    const row = types.slice(
      types.indexOf("export type ChildAccessCredentialRow"),
      types.indexOf("export type ChildSessionRow"),
    );
    expect(row).not.toContain("code_hash");
    expect(row).not.toContain("code_lookup");
  });

  it("only one code can be live per child, enforced by a unique index", () => {
    expect(childAccess()).toMatch(
      /create unique index if not exists child_access_credentials_active_idx[\s\S]*?where revoked_at is null/,
    );
  });

  it("regenerating revokes the previous code AND its open sessions", () => {
    const s = childAccess();
    const fn = s.slice(s.indexOf("create or replace function generate_child_access_code"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/update child_access_credentials\s*\n?\s*set revoked_at = now\(\)/);
    expect(body).toMatch(/update child_sessions\s*\n?\s*set revoked_at = now\(\)/);
  });
});

describe("the login endpoint cannot be brute-forced or enumerated (D-58)", () => {
  it("records the failed attempt by RETURNING, never by raising", () => {
    /*
     * This is the bug the executed test found: the first version inserted the
     * attempt and then raised, and the raise rolled the insert back, so the
     * ledger stayed empty and seven wrong codes in a row were all allowed.
     * A `raise exception` anywhere after an attempt insert re-introduces it.
     */
    const s = childAccess();
    const fn = s.slice(s.indexOf("create or replace function redeem_child_code"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/insert into child_auth_attempts/);
    expect(body, "redeem_child_code must not raise — a raise discards the attempt ledger")
      .not.toMatch(/raise exception/);
    expect(body).toMatch(/return query select 'rate_limited'/);
    expect(body).toMatch(/return query select 'invalid_code'/);
  });

  it("limits per code and across all codes", () => {
    const s = childAccess();
    expect(s).toMatch(/v_recent >= 5 or v_global >= 100/);
    expect(s).toMatch(/interval '15 minutes'/);
    expect(s).toMatch(/interval '5 minutes'/);
  });

  it("wrong, revoked and expired codes are indistinguishable to the caller", () => {
    const s = childAccess();
    const fn = s.slice(s.indexOf("create or replace function redeem_child_code"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    // one combined condition, one outcome
    expect(body).toMatch(
      /if v_cred\.id is null[\s\S]*?or v_cred\.code_hash <>[\s\S]*?or \(v_cred\.expires_at is not null/,
    );
  });

  it("the form surfaces one message for every failure kind", () => {
    const actions = code("src/features/child-auth/actions.ts");
    expect(actions).toContain("That code didn't work.");
    // and never echoes the submitted code
    expect(actions).not.toMatch(/error:\s*`[^`]*\$\{[^}]*code/);
  });

  it("never logs the submitted code", () => {
    const actions = code("src/features/child-auth/actions.ts");
    const logCalls = [...actions.matchAll(/log(?:Warn|Error|Info)\(([\s\S]{0,140}?)\)\;/g)];
    expect(logCalls.length).toBeGreaterThan(0);
    for (const [, args] of logCalls) {
      expect(args).not.toMatch(/\bcode\b/);
      expect(args).not.toMatch(/parsed\.data/);
    }
  });
});

describe("a child session is verified in the database on every use (D-59)", () => {
  it("the session token is stored only as a keyed digest", () => {
    const s = childAccess();
    expect(s).toMatch(/token_lookup text not null unique/);
    const fn = s.slice(s.indexOf("create or replace function redeem_child_code"));
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(
      /encode\(hmac\(v_token, v_pepper, 'sha256'\), 'hex'\)/,
    );
  });

  it("verification checks revocation AND expiry", () => {
    const s = childAccess();
    const fn = s.slice(s.indexOf("create or replace function verify_child_session"));
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(
      /revoked_at is null and expires_at > now\(\)/,
    );
  });

  it("the cookie is httpOnly and same-site", () => {
    const c = code("src/lib/child-session/index.ts");
    expect(c).toMatch(/httpOnly:\s*true/);
    expect(c).toMatch(/sameSite:\s*"lax"/);
  });

  it("nothing caches who the child is — every call re-verifies", () => {
    const c = code("src/lib/child-session/index.ts");
    expect(c).toContain('supabase.rpc("verify_child_session"');
    expect(c).not.toMatch(/\bcache\(|unstable_cache|revalidate\s*[:=]/);
  });

  it("logging out revokes server-side, not just in the browser", () => {
    const actions = code("src/features/child-auth/actions.ts");
    expect(actions).toContain('rpc("revoke_child_session"');
    expect(actions).toContain("clearChildSession");
  });
});

describe("no child-scoped RPC accepts a child id from the browser (D-59)", () => {
  it("every child_session_* function takes a token, never a child id", () => {
    const s = childMission() + childAccess();
    const fns = [
      ...s.matchAll(/create or replace function (child_session_[a-z_]+)\(([^)]*)\)/g),
    ];
    expect(fns.length).toBeGreaterThanOrEqual(6);
    for (const [, name, args] of fns) {
      expect(args, `${name} must take p_token`).toMatch(/p_token text/);
      expect(args, `${name} must NOT accept a child id`).not.toMatch(/p_child_id/);
    }
  });

  it("each one derives the child by assuming the actor from the token", () => {
    const s = childMission();
    const fns = [...s.matchAll(/create or replace function (child_session_[a-z_]+)\(/g)];
    for (const [, name] of fns) {
      const from = s.indexOf(`create or replace function ${name}(`);
      const body = s.slice(from, s.indexOf("$$;", from));
      expect(body, `${name} does not derive the child from the token`).toMatch(
        /assume_child_actor\(p_token\)|verify_child_session\(p_token\)/,
      );
    }
  });

  it("holding a progress id is not authorisation", () => {
    const s = childMission();
    for (const fn of ["child_session_persist_state", "child_session_complete_mission"]) {
      const from = s.indexOf(`create or replace function ${fn}(`);
      const body = s.slice(from, s.indexOf("$$;", from));
      expect(body, `${fn} does not re-scope the progress id to the session child`)
        .toMatch(/where p\.id = p_progress_id and p\.child_id = v_child/);
      expect(body).toMatch(/not_this_childs_record/);
    }
  });

  it("the actor GUC is transaction-local and set only after verification", () => {
    const s = childMission();
    const fn = s.slice(s.indexOf("create or replace function assume_child_actor"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    // `true` is the is_local argument: it cannot outlive the transaction.
    expect(body).toMatch(/set_config\('app\.child_actor', v_child::text, true\)/);
    // and it is set only after verify_child_session produced a child
    expect(body.indexOf("verify_child_session")).toBeLessThan(body.indexOf("set_config"));
    expect(body).toMatch(/no_child_session/);
  });

  it("assume_child_actor is not callable by an API role", () => {
    expect(childMission()).toMatch(
      /revoke all on function assume_child_actor\(text\) from public, anon, authenticated/,
    );
  });

  it("owns_child accepts the actor GUC only as an alternative to real ownership", () => {
    const s = childMission();
    const fn = s.slice(s.indexOf("create or replace function owns_child"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toMatch(/c\.parent_id = auth\.uid\(\)/);
    expect(body).toMatch(/current_setting\('app\.child_actor', true\)/);
  });
});

describe("a child cannot reach the parent's world (§7)", () => {
  it("middleware keeps /account, /admin and /purchase parent-only", () => {
    const m = code("src/lib/supabase/middleware.ts");
    expect(m).toMatch(/PARENT_ONLY_PREFIXES = \["\/account", "\/admin", "\/purchase"\]/);
  });

  it("a child session alone never satisfies the parent-only check", () => {
    const m = code("src/lib/supabase/middleware.ts");
    // the parent-only branch keys on `user`, never on the child cookie
    expect(m).toMatch(/if \(matches\(PARENT_ONLY_PREFIXES\) && !user\)/);
  });

  it("the child sidebar offers no Account and no child switcher", () => {
    const shell = code("src/components/academy/academy-shell.tsx");
    const childBranch = shell.slice(
      shell.indexOf('if (actor.kind === "child")'),
      shell.indexOf("const nav: NavItem[] = ["),
    );
    expect(childBranch).not.toContain("/account");
    expect(childBranch).not.toContain("ProfileSwitcher");
  });

  it("a child's mission list carries no commercial fields", () => {
    const s = childAccess();
    const fn = s.slice(s.indexOf("create or replace function child_session_missions"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    for (const col of ["price_minor", "is_free", "currency"]) {
      expect(body, `child_session_missions exposes ${col}`).not.toContain(col);
    }
  });

  it("the child actor is resolved before the parent actor on a shared device", () => {
    /*
     * Scoped to the function body: comparing positions in the whole file would
     * only compare the order of the import statements, which says nothing
     * about which is consulted first.
     */
    const actor = code("src/features/academy/actor.ts");
    const body = actor.slice(actor.indexOf("export async function resolveAcademyActor"));
    expect(body.indexOf("getChildSession")).toBeGreaterThan(-1);
    expect(body.indexOf("getChildSession")).toBeLessThan(body.indexOf("requireParent"));
  });
});

describe("admins may revoke a child code but never mint one", () => {
  it("revoke permits an admin; generate does not", () => {
    const s = childAccess();
    const gen = s.slice(s.indexOf("create or replace function generate_child_access_code"));
    expect(gen.slice(0, gen.indexOf("$$;")), "an admin must not generate a code")
      .not.toMatch(/is_admin\(\)/);

    const rev = s.slice(s.indexOf("create or replace function revoke_child_access_code"));
    expect(rev.slice(0, rev.indexOf("$$;"))).toMatch(/is_admin\(\)/);
  });

  it("no admin action generates a code", () => {
    const a = code("src/features/admin/child-access-actions.ts");
    expect(a).not.toContain("generate_child_access_code");
    expect(a).toContain("revoke_child_access_code");
  });
});

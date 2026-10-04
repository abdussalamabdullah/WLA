/**
 * WLA SECURITY REGRESSION — against HOSTED STAGING, through the real API.
 *
 * Every check below goes through PostgREST and GoTrue exactly as the browser
 * does, as a real role with a real session. Nothing here uses a service-role
 * key: the only credentials are the three QA review accounts and the public
 * anon key, so this is reproducible by anyone who can sign in as them.
 *
 * WHY THIS EXISTS ALONGSIDE THE LOCAL SUITE
 *   The local suite (scripts/security-regression.sql) can reach the database
 *   as the table owner and therefore test the immutability TRIGGER directly.
 *   This one reaches only what a client can reach — which is the thing an
 *   attacker also has. Both matter; neither replaces the other. The pgcrypto
 *   schema defect was invisible to the local suite until the shim was made
 *   faithful, which is the standing lesson.
 *
 * Usage: node scripts/staging-security.mjs
 */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const SB_URL = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim();
const SB_ANON = /NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)[1].trim();

const ACCOUNTS = {
  admin:  ["wla-review-admin@wla-staging.test",  "WLA-Review-Admin-2026"],
  parent: ["wla-review-parent@wla-staging.test", "WLA-Review-Parent-2026"],
  family: ["wla-review-family@wla-staging.test", "WLA-Review-Family-2026"],
};

let pass = 0, fail = 0;
const failures = [];
function chk(label, ok, detail = "") {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
function section(t) { console.log(`\n=============== ${t} ===============`); }

const H = (tok) => ({
  apikey: SB_ANON,
  ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  "Content-Type": "application/json",
});
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

async function signIn(kind) {
  const [email, password] = ACCOUNTS[kind];
  const d = await j(await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
  if (!d.access_token) throw new Error(`sign-in failed for ${kind}: ${JSON.stringify(d)}`);
  return d.access_token;
}
const rest = (path, tok, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H(tok), ...(init.headers || {}) } });
const rpc = (fn, tok, body = {}) =>
  fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H(tok), body: JSON.stringify(body) });

/** Did this call fail with the expected reason? */
async function refuses(label, res, expect) {
  const body = await j(res);
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const ok = !res.ok && (expect ? (expect instanceof RegExp ? expect.test(text) : text.includes(expect)) : true);
  chk(label, ok, ok ? "" : `HTTP ${res.status} ${text.slice(0, 120)}`);
  return body;
}

const main = async () => {
  const T = {
    admin: await signIn("admin"),
    parent: await signIn("parent"),
    family: await signIn("family"),
  };
  chk("all three QA accounts sign in", true);

  const missions = await j(await rest("missions?slug=eq.six-names&select=id,version,published", T.admin));
  const MID = missions[0].id;
  chk("Six Names is NOT published to the catalogue", missions[0].published === false);

  const kidsA = await j(await rest("child_profiles?select=id,display_name&order=display_name", T.parent));
  const kidsB = await j(await rest("child_profiles?select=id,display_name&order=display_name", T.family));
  chk("family A sees only its own children", kidsA.length === 3, `saw ${kidsA.length}`);
  chk("family B sees only its own children", kidsB.length === 2, `saw ${kidsB.length}`);
  const A = Object.fromEntries(kidsA.map((c) => [c.display_name.split(" ")[0], c.id]));
  const B = Object.fromEntries(kidsB.map((c) => [c.display_name.split(" ")[0], c.id]));

  // ─────────────────────────────────────────── child credentials & sessions
  section("CHILD CREDENTIALS AND SESSIONS");
  await refuses("another family cannot mint a code for a child it does not own",
    await rpc("generate_child_access_code", T.family, { p_child_id: A.Bilal }), "not_your_child");

  const code = await j(await rpc("generate_child_access_code", T.parent, { p_child_id: A.Bilal }));
  chk("the owning parent mints a code", /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), String(code).slice(0, 40));

  const cred = await j(await rest(
    `child_access_credentials?child_id=eq.${A.Bilal}&revoked_at=is.null&select=id,created_at,last_used_at`, T.parent));
  chk("a parent can see that a code exists", Array.isArray(cred) && cred.length === 1);
  const hashPeek = await j(await rest(
    `child_access_credentials?child_id=eq.${A.Bilal}&select=code_hash`, T.parent));
  chk("a parent cannot select the hash column",
    !Array.isArray(hashPeek) || hashPeek.length === 0 || hashPeek[0].code_hash === undefined,
    JSON.stringify(hashPeek).slice(0, 100));

  const redeemed = await j(await rpc("redeem_child_code", null, { p_code: code }));
  const sess = Array.isArray(redeemed) ? redeemed[0] : redeemed;
  chk("an anonymous caller redeems a valid code", sess?.outcome === "ok", JSON.stringify(sess).slice(0, 90));
  const TOKEN = sess?.token;
  chk("redemption returns the right child", sess?.display_name?.startsWith("Bilal"));

  const verified = await j(await rpc("verify_child_session", null, { p_token: TOKEN }));
  chk("the session resolves to exactly one child", Array.isArray(verified) && verified.length === 1);
  const bogus = await j(await rpc("verify_child_session", null, { p_token: "0000deadbeef" }));
  chk("a forged token resolves to nobody", Array.isArray(bogus) && bogus.length === 0);

  // Brute force. The limiter must actually engage.
  /*
   * A DIFFERENT wrong code on every run. The limiter's window is 15 minutes
   * and is keyed per code, so a fixed probe makes the first attempt of a
   * re-run return rate_limited — which reads as "a wrong code was accepted as
   * something else" rather than as the limiter still working.
   */
  const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const rnd = (n) => Array.from({ length: n },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  const probe = `${rnd(4)}-${rnd(4)}`;
  let outcomes = [];
  for (let i = 0; i < 6; i++) {
    const r = await j(await rpc("redeem_child_code", null, { p_code: probe }));
    outcomes.push((Array.isArray(r) ? r[0] : r)?.outcome);
  }
  chk("a wrong code is refused", outcomes[0] === "invalid_code", outcomes.join(","));
  chk("brute force is rate limited", outcomes.includes("rate_limited"), outcomes.join(","));

  const stillOk = await j(await rpc("redeem_child_code", null, { p_code: code }));
  chk("the limiter is per-code, not a global lockout",
    (Array.isArray(stillOk) ? stillOk[0] : stillOk)?.outcome === "ok");

  // ────────────────────────────────────────────────── child authorization
  section("CHILD AUTHORIZATION");
  const mine = await j(await rpc("child_session_missions", null, { p_token: TOKEN }));
  chk("a child sees only their own entitled missions", Array.isArray(mine) && mine.length === 1);

  const screen = await j(await rpc("child_session_current_screen", null,
    { p_token: TOKEN, p_mission_id: MID }));
  chk("a child receives exactly ONE screen", Array.isArray(screen) && screen.length === 1,
    JSON.stringify(screen).slice(0, 90));

  await refuses("a forged token cannot start a mission",
    await rpc("child_session_start_mission", null, { p_token: "not-a-token", p_mission_id: MID }),
    "no_child_session");

  // A child session must not reach the parent's world.
  const pk = await j(await rest("child_profiles?select=id", null));
  chk("an anonymous caller reads no child profiles", Array.isArray(pk) && pk.length === 0);
  const pp = await j(await rest("mission_progress?select=id", null));
  chk("an anonymous caller reads no progress", Array.isArray(pp) && pp.length === 0);
  await refuses("an anonymous caller cannot read the pepper",
    await rest("app_secrets?select=*", null));

  // Another child's progress id is not authorisation.
  const codeL = await j(await rpc("generate_child_access_code", T.family, { p_child_id: B.Layla }));
  const sessL = (await j(await rpc("redeem_child_code", null, { p_code: codeL })))[0];
  const progA = await j(await rest(
    `mission_progress?child_id=eq.${A.Bilal}&select=id`, T.parent));
  if (progA[0]) {
    await refuses("one child cannot persist onto another child's progress id",
      await rpc("child_session_persist_state", null, {
        p_token: sessL.token, p_progress_id: progA[0].id,
        p_state: {}, p_screen_key: "the_list",
      }), /not_this_childs_record|permission denied/); // D-80: no client may call it at all now
  }
  await refuses("a child cannot open a mission they are not entitled to",
    await rpc("child_session_current_screen", null,
      { p_token: sessL.token, p_mission_id: "00000000-0000-0000-0000-000000000000" }),
    "not_entitled");

  // ──────────────────────────────────────────────── cross-family isolation
  section("CROSS-FAMILY ISOLATION");
  const foreign = await j(await rest(`child_profiles?id=eq.${B.Layla}&select=display_name`, T.parent));
  chk("a parent cannot read another family's child", Array.isArray(foreign) && foreign.length === 0);
  const foreignProg = await j(await rest(`mission_progress?child_id=eq.${B.Layla}&select=status`, T.parent));
  chk("a parent cannot read another family's progress", Array.isArray(foreignProg) && foreignProg.length === 0);
  await refuses("a parent cannot open another family's child mission",
    await rpc("get_current_mission_screen", T.parent, { p_child_id: B.Layla, p_mission_id: MID }),
    "not_your_child");
  await refuses("a parent cannot start a mission for another family's child",
    await rpc("start_mission", T.parent, { p_child_id: B.Layla, p_mission_id: MID }),
    "not_your_child");

  // ───────────────────────────────────────────────────── admin escalation
  section("ADMIN ESCALATION");
  for (const fn of ["admin_overview", "admin_parents", "admin_children", "admin_orders",
                    "admin_analytics", "admin_activity", "admin_mission_stats"]) {
    await refuses(`a parent cannot call ${fn}`, await rpc(fn, T.parent, {}), "not_admin");
  }
  await refuses("a parent cannot create a mission",
    await rpc("create_mission", T.parent,
      { p_slug: "x-mission", p_title: "X", p_lab: "curiosity", p_min_age: 7, p_max_age: 11 }), "not_admin");
  await refuses("a parent cannot create a version",
    await rpc("create_mission_version", T.parent, { p_mission_id: MID }), "not_admin");
  await refuses("a parent cannot author a screen",
    await rpc("admin_upsert_screen", T.parent, {
      p_mission_id: MID, p_version: 2, p_screen_key: "x", p_type: "content",
      p_title: "", p_body: "", p_sequence: 1, p_configuration: {},
    }), "not_admin");
  await refuses("a parent cannot publish a version",
    await rpc("set_mission_version_status", T.parent,
      { p_mission_id: MID, p_version: 2, p_status: "published" }), "not_admin");

  // D-49 — self-promotion.
  const esc = await rest(`profiles?id=eq.${(await j(await rest("profiles?select=id", T.parent)))[0].id}`,
    T.parent, { method: "PATCH", headers: { Prefer: "return=representation" },
                body: JSON.stringify({ is_admin: true }) });
  const escBody = await j(esc);
  chk("a parent cannot make themselves an admin",
    !esc.ok || (Array.isArray(escBody) && escBody.length === 0),
    `HTTP ${esc.status} ${JSON.stringify(escBody).slice(0, 80)}`);
  const stillParent = await j(await rest("profiles?select=is_admin", T.parent));
  chk("is_admin did not change", stillParent.every((p) => p.is_admin === false));

  // ────────────────────────────────────────────────────── admin boundaries
  section("ADMIN BOUNDARIES");
  const screens = await j(await rest("mission_screens?select=screen_key", T.admin));
  chk("an admin cannot read mission_screens directly (D-52)",
    Array.isArray(screens) && screens.length === 0, JSON.stringify(screens).slice(0, 80));
  await refuses("an admin cannot read a PUBLISHED version through the builder (D-61)",
    await rpc("admin_draft_screens", T.admin, { p_mission_id: MID, p_version: 2 }),
    "version_not_editable");
  await refuses("an admin cannot author into a published version",
    await rpc("admin_upsert_screen", T.admin, {
      p_mission_id: MID, p_version: 2, p_screen_key: "sneak", p_type: "content",
      p_title: "x", p_body: "y", p_sequence: 999, p_configuration: {},
    }), "version_not_editable");
  await refuses("an admin cannot delete a screen from a published version",
    await rpc("admin_delete_screen", T.admin,
      { p_mission_id: MID, p_version: 2, p_screen_key: "the_list" }), "version_not_editable");
  await refuses("an admin cannot rewrite a published completion rule",
    await rpc("admin_set_completion_rule", T.admin,
      { p_mission_id: MID, p_version: 2, p_rule: { type: "screen_reached", screenKey: "the_list" } }),
    "version_not_editable");
  await refuses("an admin cannot delete a mission with learner records",
    await rpc("delete_mission_if_unused", T.admin, { p_mission_id: MID }),
    "mission_has_learner_records");

  // D-54 — structural columns on missions.
  const verBump = await rest(`missions?id=eq.${MID}`, T.admin, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ version: 99 }) });
  const vb = await j(verBump);
  chk("an admin cannot change a mission's version by hand",
    !verBump.ok || (Array.isArray(vb) && vb.length === 0),
    `HTTP ${verBump.status} ${JSON.stringify(vb).slice(0, 80)}`);
  const stillV2 = await j(await rest("missions?slug=eq.six-names&select=version", T.admin));
  chk("Six Names is still on version 2", stillV2[0].version === 2);

  // ───────────────────────────────────────────────────────── Six Names gating
  section("SIX NAMES GATING");
  const own = await j(await rpc("get_current_mission_screen", T.parent,
    { p_child_id: A.Bilal, p_mission_id: MID }));
  chk("a parent gets exactly one screen for their own child",
    Array.isArray(own) && own.length === 1, JSON.stringify(own).slice(0, 80));
  const usage = await j(await rpc("admin_mission_version_usage", T.admin, { p_mission_id: MID }));
  const v1 = usage.find((u) => u.version === 1), v2 = usage.find((u) => u.version === 2);
  chk("v1 pinned run is intact", v1?.runs === 1, JSON.stringify(v1));
  chk("v2 runs are intact", v2?.runs >= 37, JSON.stringify(v2));

  // ─────────────────────────────────────────────────── session revocation
  section("SESSION REVOCATION");
  await j(await rpc("revoke_child_access_code", T.parent, { p_child_id: A.Bilal }));
  const afterRevoke = await j(await rpc("verify_child_session", null, { p_token: TOKEN }));
  chk("revoking a code kills its open session at once",
    Array.isArray(afterRevoke) && afterRevoke.length === 0);
  const reuse = await j(await rpc("redeem_child_code", null, { p_code: code }));
  chk("the revoked code no longer redeems",
    (Array.isArray(reuse) ? reuse[0] : reuse)?.outcome === "invalid_code");
  await refuses("a revoked session cannot act",
    await rpc("child_session_start_mission", null, { p_token: TOKEN, p_mission_id: MID }),
    "no_child_session");
  // Clean up the second family's test credential too.
  await j(await rpc("revoke_child_access_code", T.family, { p_child_id: B.Layla }));

  // ──────────────────────────────────────────── child Mission Kit access (D-64)
  section("CHILD MISSION KIT ACCESS");
  // A fresh, unrevoked session for an entitled child.
  const codeK = await j(await rpc("generate_child_access_code", T.parent, { p_child_id: A.Cara }));
  const sessK = (await j(await rpc("redeem_child_code", null, { p_code: codeK })))[0];

  const kit = await j(await rpc("child_session_kit", null,
    { p_token: sessK.token, p_mission_slug: "six-names" }));
  chk("an entitled child sees their Mission Kit", Array.isArray(kit) && kit.length > 0,
    JSON.stringify(kit).slice(0, 90));
  chk("the Kit is NOT duplicated across versions",
    Array.isArray(kit) && new Set(kit.map((r) => r.storage_path)).size === kit.length,
    `${Array.isArray(kit) ? kit.length : "?"} rows`);

  const resourceId = Array.isArray(kit) && kit[0] ? kit[0].id : null;
  const okPath = await j(await rpc("child_session_resource_path", null,
    { p_token: sessK.token, p_resource_id: resourceId }));
  chk("an entitled child resolves a Kit file path", typeof okPath === "string" && okPath.length > 0);
  chk("the path is confined to the mission's own folder",
    typeof okPath === "string" && okPath.startsWith(`${MID}/`), String(okPath).slice(0, 60));

  /*
   * A child with NO entitlement to this mission.
   *
   * NOT "a child of another family": Mission Kit is what WLA gives for a
   * MISSION, so every entitled child legitimately gets the same printables
   * regardless of family. Entitlement is the boundary that matters here, and
   * testing family instead would have asserted something untrue of the design.
   * A fresh child profile is created for this, because every pre-existing QA
   * child is entitled to Six Names.
   */
  const familyProfile = await j(await rest("profiles?select=id", T.family));
  const fresh = await j(await rest("child_profiles", T.family, {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      // RLS checks parent_id = auth.uid(), so it has to be supplied; omitting
      // it fails the WITH CHECK and returns no row.
      parent_id: familyProfile[0]?.id,
      display_name: "Kit Access Probe",
      birth_year: 2015,
    }),
  }));
  const freshId = Array.isArray(fresh) ? fresh[0]?.id : null;
  chk("fixture: an unentitled child profile exists", Boolean(freshId));

  const codeW = await j(await rpc("generate_child_access_code", T.family, { p_child_id: freshId }));
  const sessW = (await j(await rpc("redeem_child_code", null, { p_code: codeW })))[0];

  /*
   * `child_session_kit` REFUSES rather than returning an empty list, because
   * it delegates to mission_kit_for_child, which raises `not_entitled`. Either
   * shape gives the child nothing; asserting the wrong one made a correct
   * refusal read as a failure.
   */
  await refuses("an unentitled child gets no Mission Kit",
    await rpc("child_session_kit", null,
      { p_token: sessW.token, p_mission_slug: "six-names" }),
    "not_entitled");

  const wrongPath = await j(await rpc("child_session_resource_path", null,
    { p_token: sessW.token, p_resource_id: resourceId }));
  chk("an unentitled child cannot resolve a Kit file, even holding its id",
    wrongPath === null, JSON.stringify(wrongPath));

  const anonPath = await j(await rpc("child_session_resource_path", null,
    { p_token: "not-a-token", p_resource_id: resourceId }));
  chk("an anonymous caller cannot resolve a file path",
    anonPath === null || (anonPath && anonPath.code), JSON.stringify(anonPath).slice(0, 80));

  // A parent still reaches the Kit through their own entitlement.
  const parentKit = await j(await rpc("mission_kit_for_child", T.parent,
    { p_child_id: A.Cara, p_mission_id: MID }));
  chk("a parent reaches the Kit for their own child",
    Array.isArray(parentKit) && parentKit.length > 0);
  await refuses("a parent cannot reach the Kit for another family's child",
    await rpc("mission_kit_for_child", T.parent, { p_child_id: B.Idris, p_mission_id: MID }),
    "not_your_child");

  await j(await rpc("revoke_child_access_code", T.parent, { p_child_id: A.Cara }));
  await j(await rpc("revoke_child_access_code", T.family, { p_child_id: freshId }));
  // Remove the probe profile so staging keeps only its intended QA data.
  await rest(`child_profiles?id=eq.${freshId}`, T.family, { method: "DELETE" });
  const afterK = await j(await rpc("child_session_resource_path", null,
    { p_token: sessK.token, p_resource_id: resourceId }));
  chk("a revoked session cannot resolve a file path",
    afterK === null || (afterK && afterK.code), JSON.stringify(afterK).slice(0, 80));

  // ─────────────────────────────────────────────────────────────── storage
  section("STORAGE");
  const anonObj = await fetch(`${SB_URL}/storage/v1/object/list/mission-resources`, {
    method: "POST", headers: H(null), body: JSON.stringify({ prefix: "", limit: 5 }) });
  const anonBody = await j(anonObj);
  chk("an anonymous caller lists no mission resources",
    !anonObj.ok || (Array.isArray(anonBody) && anonBody.length === 0),
    `HTTP ${anonObj.status} ${JSON.stringify(anonBody).slice(0, 80)}`);
  const anonRes = await j(await rest("mission_resources?select=title", null));
  chk("an anonymous caller reads no mission_resources rows",
    Array.isArray(anonRes) && anonRes.length === 0);

  console.log(`\nPASS: ${pass}   FAIL: ${fail}`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
};

main().catch((e) => { console.error("HARNESS ERROR:", e.message); process.exit(2); });

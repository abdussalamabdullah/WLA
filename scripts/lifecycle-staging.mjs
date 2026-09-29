/**
 * THE HANDOVER TEST — brief §3, §10, §21.
 *
 * Builds a complete mission from nothing on HOSTED STAGING, using only the
 * API an administrator has, and drives it through every stage the brief lists:
 *
 *   Create → Details → Structure → Screens → Decisions → Branches →
 *   Consequences → Completion → Mission Kit → Parent Note → Validate →
 *   Preview → Review → Publish → New Version → Edit → Publish → Archive →
 *   Safe delete
 *
 * NO SOURCE CODE IS EDITED anywhere in this script. That is the whole point:
 * if any step here needed a developer, the Academy is not ready to hand over.
 *
 * It cleans up after itself, so staging keeps only its intended data.
 *
 * Usage: node scripts/lifecycle-staging.mjs
 */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const SB_URL = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim();
const SB_ANON = /NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)[1].trim();
const ADMIN = ["wla-review-admin@wla-staging.test", "WLA-Review-Admin-2026"];

let pass = 0, fail = 0;
const failures = [];
const chk = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; failures.push(label); console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};
const step = (n, t) => console.log(`\n--- ${n}. ${t} ---`);
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

/*
 * Retry transient transport failures.
 *
 * A run of this script makes ~60 sequential round trips to a hosted database;
 * one `fetch failed` part-way through says nothing about the Academy and
 * should not read as a lifecycle defect. Only network-level failures are
 * retried — an HTTP error is a real answer and is returned as-is.
 */
const fetchRetry = async (url, init, attempts = 3) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
};

let TOKEN;
const H = () => ({ apikey: SB_ANON, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" });
const rpc = async (fn, body = {}) =>
  j(await fetchRetry(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H(), body: JSON.stringify(body) }));
const rpcRaw = (fn, body = {}) =>
  fetchRetry(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H(), body: JSON.stringify(body) });
const rest = (path, init = {}) =>
  fetchRetry(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H(), ...(init.headers || {}) } });

/** Bulk delete returns the objects actually removed — [] when RLS refuses. */
const removeObject = async (path) => {
  const r = await fetchRetry(`${SB_URL}/storage/v1/object/mission-resources`, {
    method: "DELETE", headers: H(), body: JSON.stringify({ prefixes: [path] }),
  });
  const body = await j(r);
  return Array.isArray(body) ? body.length : -1;
};

const SLUG = `handover-probe-${Date.now().toString(36)}`;
let MISSION = null;

const main = async () => {
  const auth = await j(await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN[0], password: ADMIN[1] }),
  }));
  TOKEN = auth.access_token;
  chk("admin signs in", Boolean(TOKEN));

  // ───────────────────────────────────────────── 1. Create + Details
  step(1, "Create and Details");
  const created = await rpc("create_mission", {
    p_slug: SLUG, p_title: "Handover Probe", p_lab: "curiosity",
    p_min_age: 7, p_max_age: 11,
  });
  MISSION = created?.id;
  chk("an admin creates a mission from nothing", Boolean(MISSION), JSON.stringify(created).slice(0, 120));
  if (!MISSION) { console.log("\nPASS: " + pass + "   FAIL: " + fail); process.exit(1); }

  // Details are ordinary catalogue columns the admin may edit.
  const detailed = await rest(`missions?id=eq.${MISSION}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      description: "A short probe mission built entirely through the admin API.",
      duration: "20 mins", delivery_type: "hybrid",
      price_minor: 0, is_free: true,
    }),
  });
  const d = await j(detailed);
  chk("an admin edits the mission's details", Array.isArray(d) && d.length === 1,
    `HTTP ${detailed.status} ${JSON.stringify(d).slice(0, 90)}`);

  const v1 = await rpc("admin_mission_versions", { p_mission_id: MISSION });
  chk("a draft v1 exists to author into",
    Array.isArray(v1) && v1[0]?.version === 1 && v1[0]?.status === "draft",
    JSON.stringify(v1).slice(0, 90));

  // ────────────────────── 2–6. Structure, Screens, Decisions, Branches, Consequences
  step(2, "Structure, Screens, Decisions, Branches, Consequences");
  const screens = [
    ["intro", "content", "Before you start", "Read this first.", 10, { next: "choose" }],
    ["choose", "choice", "What will you do?", null, 20, {
      options: [
        { id: "look", label: "Look more closely", next: "went_looking" },
        { id: "ask", label: "Ask someone", next: "went_asking" },
      ],
    }],
    ["went_looking", "content", "You looked", "You noticed something new.", 30, { next: "reflect" }],
    ["went_asking", "content", "You asked", "They told you something new.", 40, { next: "reflect" }],
    ["reflect", "reflection", "What changed?", null, 50, { prompt: "What do you think now?", next: "finish" }],
    ["finish", "completion", "Done", null, 60, { trailEntries: [] }],
  ];
  for (const [key, type, title, body, seq, config] of screens) {
    const r = await rpcRaw("admin_upsert_screen", {
      p_mission_id: MISSION, p_version: 1, p_screen_key: key, p_type: type,
      p_title: title, p_body: body, p_sequence: seq, p_configuration: config,
    });
    chk(`authors screen "${key}" (${type})`, r.ok, `HTTP ${r.status}`);
  }
  const drafted = await rpc("admin_draft_screens", { p_mission_id: MISSION, p_version: 1 });
  chk("all six screens are readable in the draft",
    Array.isArray(drafted) && drafted.length === 6, `${drafted?.length} screens`);
  chk("the decision carries two branches",
    drafted?.find((s) => s.screen_key === "choose")?.configuration?.options?.length === 2);

  // ───────────────────────────────────────────────── 7. Completion
  step(7, "Completion rule");
  const ruleRes = await rpcRaw("admin_set_completion_rule", {
    p_mission_id: MISSION, p_version: 1,
    p_rule: { type: "screen_reached", screenKey: "finish" },
  });
  chk("an admin sets the completion rule", ruleRes.ok, `HTTP ${ruleRes.status}`);

  // ──────────────────────────────────────── validation catches an incomplete mission
  step("7b", "Validation before the Kit and note exist");
  const early = await rpc("validate_mission_version", { p_mission_id: MISSION, p_version: 1 });
  const earlyBlocking = (early ?? []).filter((p) => p.blocking).map((p) => p.code);
  chk("validation blocks a hybrid mission with no Mission Kit",
    earlyBlocking.includes("no_kit_resources"), earlyBlocking.join(","));
  chk("validation blocks a mission with no parent note",
    earlyBlocking.includes("no_parent_note"), earlyBlocking.join(","));
  const refusedPublish = await rpcRaw("set_mission_version_status", {
    p_mission_id: MISSION, p_version: 1, p_status: "published",
  });
  chk("publishing is refused while blocking problems exist", !refusedPublish.ok,
    `HTTP ${refusedPublish.status}`);

  // ───────────────────────────────────────────────── 8. Mission Kit
  step(8, "Mission Kit");
  const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])],
    { type: "application/pdf" });
  const kitPath = `${MISSION}/probe-sheet.pdf`;
  const up = await fetch(`${SB_URL}/storage/v1/object/mission-resources/${kitPath}`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/pdf" },
    body: pdf,
  });
  chk("an admin uploads a Kit file to the private bucket", up.ok,
    `HTTP ${up.status} ${(await up.clone().text()).slice(0, 80)}`);

  const addRes = await rpcRaw("admin_upsert_resource", {
    p_mission_id: MISSION, p_version: 1, p_id: null,
    p_title: "Probe sheet", p_description: "One page to print.",
    p_type: "pdf", p_storage_path: kitPath,
    p_can_view: true, p_can_print: true, p_can_download: true, p_sort_order: 10,
  });
  chk("an admin adds the Kit resource", addRes.ok, `HTTP ${addRes.status}`);

  const outside = await rpcRaw("admin_upsert_resource", {
    p_mission_id: MISSION, p_version: 1, p_id: null,
    p_title: "Evil", p_description: null, p_type: "pdf",
    p_storage_path: "some-other-mission/evil.pdf",
    p_can_view: true, p_can_print: true, p_can_download: true, p_sort_order: 20,
  });
  chk("a Kit path outside the mission's folder is refused", !outside.ok, `HTTP ${outside.status}`);

  const kit = await rpc("admin_draft_resources", { p_mission_id: MISSION, p_version: 1 });
  chk("the Kit reads back with one resource", Array.isArray(kit) && kit.length === 1);

  // ───────────────────────────────────────────────── 9. Parent Note
  step(9, "Parent Note");
  const noteRes = await rpcRaw("admin_save_parent_note", {
    p_mission_id: MISSION, p_version: 1,
    p_content: "## What this asks\n\nTwenty minutes, one printed sheet.",
    p_document_path: null,
  });
  chk("an admin writes the parent note", noteRes.ok, `HTTP ${noteRes.status}`);
  const note = await rpc("admin_draft_parent_note", { p_mission_id: MISSION, p_version: 1 });
  chk("the note reads back", Array.isArray(note) && note[0]?.content?.includes("Twenty minutes"));

  // ───────────────────────────────────────────── 10. Validate, 11. Review
  step(10, "Validate and Review");
  const problems = await rpc("validate_mission_version", { p_mission_id: MISSION, p_version: 1 });
  const blocking = (problems ?? []).filter((p) => p.blocking);
  chk("a complete draft has no blocking problems", blocking.length === 0,
    blocking.map((b) => b.code).join(","));

  const review = await rpcRaw("set_mission_version_status", {
    p_mission_id: MISSION, p_version: 1, p_status: "in_review",
  });
  chk("an admin submits it for review", review.ok, `HTTP ${review.status}`);
  const inReview = await rpc("admin_mission_versions", { p_mission_id: MISSION });
  chk("the version is in review", inReview?.[0]?.status === "in_review");
  chk("an in-review version is still previewable and editable",
    Array.isArray(await rpc("admin_draft_screens", { p_mission_id: MISSION, p_version: 1 })));

  // ───────────────────────────────────────────────── 12. Publish
  step(12, "Publish");
  const published = await rpcRaw("set_mission_version_status", {
    p_mission_id: MISSION, p_version: 1, p_status: "published",
  });
  chk("an admin publishes the version", published.ok, `HTTP ${published.status}`);
  const afterPublish = await j(await rest(`missions?id=eq.${MISSION}&select=version,published`));
  chk("new runs will pin to v1", afterPublish?.[0]?.version === 1);
  const pubVersions = await rpc("admin_mission_versions", { p_mission_id: MISSION });
  chk("v1 is published", pubVersions?.find((v) => v.version === 1)?.status === "published");

  const sealed = await rpcRaw("admin_upsert_screen", {
    p_mission_id: MISSION, p_version: 1, p_screen_key: "sneak", p_type: "content",
    p_title: "x", p_body: "y", p_sequence: 999, p_configuration: {},
  });
  chk("the published version is now sealed", !sealed.ok, `HTTP ${sealed.status}`);
  const sealedKit = await rpcRaw("admin_upsert_resource", {
    p_mission_id: MISSION, p_version: 1, p_id: null, p_title: "x",
    p_description: null, p_type: "pdf", p_storage_path: `${MISSION}/x.pdf`,
    p_can_view: true, p_can_print: true, p_can_download: true, p_sort_order: 99,
  });
  chk("the published Kit is sealed too", !sealedKit.ok, `HTTP ${sealedKit.status}`);
  const sealedNote = await rpcRaw("admin_save_parent_note", {
    p_mission_id: MISSION, p_version: 1, p_content: "changed", p_document_path: null,
  });
  chk("the published parent note is sealed too", !sealedNote.ok, `HTTP ${sealedNote.status}`);

  // D-68: the FILE behind a published resource is sealed as well as its row.
  const overwrite = await fetchRetry(`${SB_URL}/storage/v1/object/mission-resources/${kitPath}`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x58])], { type: "application/pdf" }),
  });
  chk("the published Kit FILE cannot be overwritten (D-68)", !overwrite.ok, `HTTP ${overwrite.status}`);
  chk("the published Kit FILE cannot be deleted (D-68)", (await removeObject(kitPath)) === 0);
  const noPreview = await rpcRaw("admin_draft_screens", { p_mission_id: MISSION, p_version: 1 });
  chk("a published version is not readable through the builder", !noPreview.ok,
    `HTTP ${noPreview.status}`);

  // ──────────────────────────────── 13. New version, edit, publish again
  step(13, "New version, edit, publish again");
  const v2 = await rpc("create_mission_version", { p_mission_id: MISSION });
  chk("an admin creates a new version", v2?.version === 2 && v2?.status === "draft",
    JSON.stringify(v2).slice(0, 90));

  const v2screens = await rpc("admin_draft_screens", { p_mission_id: MISSION, p_version: 2 });
  chk("the new version inherits every screen", v2screens?.length === 6, `${v2screens?.length}`);
  const v2kit = await rpc("admin_draft_resources", { p_mission_id: MISSION, p_version: 2 });
  chk("the new version inherits the Mission Kit", v2kit?.length === 1, `${v2kit?.length}`);
  const v2note = await rpc("admin_draft_parent_note", { p_mission_id: MISSION, p_version: 2 });
  chk("the new version inherits the parent note", Boolean(v2note?.[0]?.content));

  const edited = await rpcRaw("admin_upsert_screen", {
    p_mission_id: MISSION, p_version: 2, p_screen_key: "intro", p_type: "content",
    p_title: "Before you start (revised)", p_body: "Read this first.", p_sequence: 10,
    p_configuration: { next: "choose" },
  });
  chk("the new version is editable", edited.ok, `HTTP ${edited.status}`);

  // A deliberate break, to prove validation still guards the second publish.
  await rpcRaw("admin_upsert_screen", {
    p_mission_id: MISSION, p_version: 2, p_screen_key: "choose", p_type: "choice",
    p_title: "What will you do?", p_body: null, p_sequence: 20,
    p_configuration: { options: [
      { id: "look", label: "Look more closely", next: "nowhere" },
      { id: "ask", label: "Ask someone", next: "went_asking" },
    ] },
  });
  const brokenProblems = await rpc("validate_mission_version", { p_mission_id: MISSION, p_version: 2 });
  const brokenCodes = (brokenProblems ?? []).filter((p) => p.blocking).map((p) => p.code);
  chk("a broken branch is caught in the new version",
    brokenCodes.includes("broken_reference"), brokenCodes.join(","));
  const refused2 = await rpcRaw("set_mission_version_status", {
    p_mission_id: MISSION, p_version: 2, p_status: "published",
  });
  chk("publishing the broken version is refused", !refused2.ok, `HTTP ${refused2.status}`);

  // Repair and publish.
  await rpcRaw("admin_upsert_screen", {
    p_mission_id: MISSION, p_version: 2, p_screen_key: "choose", p_type: "choice",
    p_title: "What will you do?", p_body: null, p_sequence: 20,
    p_configuration: { options: [
      { id: "look", label: "Look more closely", next: "went_looking" },
      { id: "ask", label: "Ask someone", next: "went_asking" },
    ] },
  });
  const published2 = await rpcRaw("set_mission_version_status", {
    p_mission_id: MISSION, p_version: 2, p_status: "published",
  });
  chk("the repaired version publishes", published2.ok, `HTTP ${published2.status}`);
  const finalVersions = await rpc("admin_mission_versions", { p_mission_id: MISSION });
  chk("v1 was archived, not deleted",
    finalVersions?.find((v) => v.version === 1)?.status === "archived");
  chk("v2 is published", finalVersions?.find((v) => v.version === 2)?.status === "published");
  const afterSecond = await j(await rest(`missions?id=eq.${MISSION}&select=version`));
  chk("new runs now pin to v2", afterSecond?.[0]?.version === 2);

  // ───────────────────────────────────────────────── 14. Archive
  step(14, "Archive");
  const archived = await rpcRaw("set_mission_version_status", {
    p_mission_id: MISSION, p_version: 2, p_status: "archived",
  });
  chk("an admin archives the published version", archived.ok, `HTTP ${archived.status}`);
  const archivedVersions = await rpc("admin_mission_versions", { p_mission_id: MISSION });
  chk("every version is now archived",
    (archivedVersions ?? []).every((v) => v.status === "archived"));
  const reopen = await rpcRaw("set_mission_version_status", {
    p_mission_id: MISSION, p_version: 2, p_status: "draft",
  });
  chk("an archived version cannot be reopened", !reopen.ok, `HTTP ${reopen.status}`);

  // ───────────────────────────────────────────────── 15. Safe delete
  step(15, "Safe delete");
  const deleted = await rpc("delete_mission_if_unused", { p_mission_id: MISSION });
  chk("a mission with no learner records can be deleted", deleted === true,
    JSON.stringify(deleted).slice(0, 90));
  const gone = await j(await rest(`missions?id=eq.${MISSION}&select=id`));
  chk("the mission is gone", Array.isArray(gone) && gone.length === 0);
  MISSION = null;

  // Nothing references the upload any more, so housekeeping may remove it —
  // and must, or every run leaves an orphan behind in the private bucket.
  chk("the orphaned Kit file is removed with the mission (D-68)", (await removeObject(kitPath)) === 1);

  // And Six Names, which HAS learner records, still cannot be.
  const six = await j(await rest("missions?slug=eq.six-names&select=id,published"));
  const sixDel = await rpcRaw("delete_mission_if_unused", { p_mission_id: six[0].id });
  chk("a mission with learner records still cannot be deleted", !sixDel.ok, `HTTP ${sixDel.status}`);
  chk("Six Names is untouched and unpublished", six[0].published === false);

  console.log(`\nPASS: ${pass}   FAIL: ${fail}`);
  if (fail) { console.log("\nFailures:"); failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
};

main().catch(async (e) => {
  console.error("HARNESS ERROR:", e.message);
  if (MISSION) {
    try { await rpc("delete_mission_if_unused", { p_mission_id: MISSION }); } catch {}
  }
  process.exit(2);
});

/**
 * QA fixtures on HOSTED STAGING for the acceptance run. Needs the service key.
 *
 * Staging GoTrue rejects `@wla-staging.test` at signup (email_address_invalid),
 * so the QA parent is created confirmed through the admin API, as the review
 * accounts were. Children are created afterwards THROUGH THE PARENT UI by
 * setup.mjs; this script then grants Six Names to the six branch children —
 * Six Names is unpublished, so no checkout or free grant can reach it.
 *
 *   node fixtures.mjs parent   → writes qa-parent.json
 *   node setup.mjs             → signs in via the UI, creates 7 children
 *   node fixtures.mjs grant    → writes qa-kids.json, grants Six Names
 *   node cleanup.mjs           → removes children via UI, deletes the parent
 */
import { readFileSync, writeFileSync } from "node:fs";
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const U = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), K = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const mode = process.argv[2];
if (mode === "parent") {
  const email = `qa-accept-${Date.now().toString(36)}@wla-staging.test`;
  const password = "QA-Accept-" + Math.random().toString(36).slice(2, 10);
  const r = await fetch(`${U}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: "QA Acceptance" } }) });
  if (!r.ok) throw new Error(`create parent: ${r.status}`);
  writeFileSync("qa-parent.json", JSON.stringify({ email, password }));
  console.log("QA parent created:", email);
} else if (mode === "grant") {
  const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
  const p = (await (await fetch(`${U}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(q.email)}`, { headers: H })).json())[0];
  const kids = await (await fetch(`${U}/rest/v1/child_profiles?select=id,display_name&parent_id=eq.${p.id}`, { headers: H })).json();
  const six = (await (await fetch(`${U}/rest/v1/missions?select=id&slug=eq.six-names`, { headers: H })).json())[0];
  const rows = kids.filter((k) => k.display_name !== "QA Builder Child").map((k) => ({ child_id: k.id, mission_id: six.id, source: "admin", status: "active" }));
  const r = await fetch(`${U}/rest/v1/mission_entitlements`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify(rows) });
  writeFileSync("qa-kids.json", JSON.stringify({ parentId: p.id, sixId: six.id, kids }));
  console.log("granted Six Names to", rows.length, "children:", r.status);
} else if (mode === "kids") {
  // Extra Six Names children for repeated runs (no replay exists, D-78).
  const n = Number(process.argv[3] ?? 6);
  const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
  const p = (await (await fetch(`${U}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(q.email)}`, { headers: H })).json())[0];
  const six = (await (await fetch(`${U}/rest/v1/missions?select=id&slug=eq.six-names`, { headers: H })).json())[0];
  const stamp = Date.now().toString(36).slice(-4);
  const rows = Array.from({ length: n }, (_, i) => ({ parent_id: p.id, display_name: `QA Run ${stamp}-${i + 1}`, birth_year: 2014 }));
  const made = await (await fetch(`${U}/rest/v1/child_profiles`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(rows) })).json();
  await fetch(`${U}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify(made.map((k) => ({ child_id: k.id, mission_id: six.id, source: "admin", status: "active" }))) });
  const all = JSON.parse(readFileSync("qa-kids.json", "utf8"));
  all.kids.push(...made.map((k) => ({ id: k.id, display_name: k.display_name })));
  writeFileSync("qa-kids.json", JSON.stringify(all));
  console.log("made", made.map((k) => k.display_name).join(", "));
} else console.log("usage: node fixtures.mjs parent|grant|kids [n]");

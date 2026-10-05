// FINAL QA — security probes through the real app, with real parent and child
// sessions: admin-only surfaces, draft/in-review/preview, unpublished missions,
// printables and QR for an unentitled child.
import { launch, chk, summary, uiLogin, sleep, BASE } from "./cdp.mjs";
import { readFileSync } from "node:fs";

const { slug: SLUG, id: MID } = JSON.parse(readFileSync("/tmp/wla-qa/final-mission.json", "utf8"));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const svc = async (p) => (await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const kids = await svc(`child_profiles?select=id,display_name&display_name=like.QA%20Final*&order=created_at.desc&limit=2`);
const kid = kids.find((k) => !/Sib/.test(k.display_name)), sib = kids.find((k) => /Sib/.test(k.display_name));
const vs = await svc(`mission_versions?mission_id=eq.${MID}&select=version,status&order=version`);
const draftV = vs.find((v) => v.status === "draft")?.version;

const P = await launch({ port: 9595 }), C = await launch({ port: 9596 });
await P.viewport(1512, 950); await C.viewport(390, 844, true);
await uiLogin(P, q.email, q.password);
await P.goto(`/account/children/${kid.id}`, 800);
await P.click(/^(create a code|make a new code)$/i, { selector: "button" });
await P.waitText(/new code\. Write it down/i, 30000);
const code = await P.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
await C.goto("/child/login", 400);
for (let i = 0; i < 40 && !(await C.eval("!!document.querySelector('input[name=code]')")); i++) await sleep(500);
await C.fill("input[name=code]", code); await C.click(/continue/i, { selector: "button[type=submit]" });
await C.waitUrl(/\/academy/, 40000);
const jar = async (b) => (await b.getCookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const get = async (b, path) => { const r = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie: await jar(b) } }); return { s: r.status, loc: r.headers.get("location") || "", body: r.status === 200 ? await r.text() : "" }; };
const dump = (r) => r.body.replace(/<script[\s\S]*?<\/script>/g,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0, 400);
const refused = (r, leak) => r.s === 404 || ((r.s === 307 || r.s === 303 || r.s === 302) && !/\/admin/.test(r.loc)) || (r.s === 200 && !leak.test(r.body));

const ADMIN = [
  ["/admin", /Missions|Analytics/],
  [`/admin/missions/${SLUG}`, /Create new version|Restore as new draft/],
  [`/admin/builder/${SLUG}/${draftV}`, /Mission logic|Add a screen/],
  [`/admin/builder/${SLUG}/${draftV}/preview`, /The crossing/],
  [`/admin/builder/${SLUG}/${draftV}/qr`, new RegExp(`/q/${SLUG}/gate`)],
  [`/admin/analytics/${SLUG}`, /Starts|Completions/],
  ["/admin/board", /Approve|Moderat/],
];
for (const [who, b] of [["parent", P], ["child session", C]]) {
  for (const [path, leak] of ADMIN) {
    const r = await get(b, path);
    chk(`${who}: ${path.replace(SLUG, "<m>")} refused`, refused(r, leak), `${r.s} ${r.loc}`);
  }
}

// Unpublished duplicate: no entitlement, never published.
await P.cookies([{ name: "wla_active_child", value: kid.id }]);
for (const [who, b] of [["parent", P], ["child session", C]]) {
  await b.goto(`/academy/missions/${SLUG}-copy`, 2500);
  const t = await b.eval("document.body.innerText");
  chk(`${who}: an unpublished, unentitled mission is not found (rendered)`, !/Start Mission|Mission Kit|QA FINAL/.test(t) && /not found|couldn.t find|doesn.t exist|404/i.test(t), t.slice(0, 160).replace(/\n+/g, " | "));
}
const pub = await fetch(`${BASE}/missions/${SLUG}`, { redirect: "manual" });
chk("public catalogue: an unpublished mission is not found", pub.status === 404, String(pub.status));

// The child's run is pinned: a newer draft never reaches it.
const prog = (await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${MID}&select=mission_version`))[0];
chk(`run stays pinned to v2 while v${draftV} is a draft`, prog?.mission_version === 2, JSON.stringify(prog));

// A sibling (no entitlement) gets nothing from printables or QR.
await P.cookies([{ name: "wla_active_child", value: sib.id }]);
const pr = await get(P, `/api/print/${SLUG}/card`);
chk("unentitled sibling: the printable is not found", pr.s === 404, String(pr.s));
const qr = await get(P, `/q/${SLUG}/gate`);
chk("unentitled sibling: a QR scan unlocks nothing", !(await svc(`mission_progress?child_id=eq.${sib.id}&mission_id=eq.${MID}&select=id`)).length, `${qr.s} ${qr.loc}`);

// A child session cannot reach parent-only pages.
for (const path of [`/academy/missions/${SLUG}/parents`]) {
  await C.goto(path, 2500);
  const t = await C.eval("document.body.innerText");
  chk("child session (rendered): For Parents note is withheld", !/A short mission about choosing a route/.test(t), `${await C.url()} | ${t.slice(0, 200).replace(/\n+/g, " | ")}`);
}
for (const path of ["/account", `/account/children/${kid.id}`]) {
  const r = await get(C, path);
  chk(`child session: ${path.replace(SLUG, "<m>").replace(kid.id, "<id>")} refused`, refused(r, /Privacy and permissions|Make a new code|Turn off this code|For Parents/), `${r.s} ${r.loc} ${dump(r)}`);
}

// Tidy: turn the code off; the open child session ends.
await P.goto(`/account/children/${kid.id}`, 600);
await P.click(/^turn off this code$/i, { selector: "button" });
for (let i = 0; i < 120 && (await svc(`child_sessions?child_id=eq.${kid.id}&revoked_at=is.null&select=id`)).length; i++) await sleep(250);
await C.goto("/academy/my-missions", 2500);
const after = { s: 0, loc: await C.url(), body: await C.eval("document.body.innerText") };
chk("turning the code off ends the child session", /\/child\/login|\/login/.test(after.loc) && !/Here are your missions/.test(after.body), `${after.s} ${after.loc} ${dump(after)}`);
console.log("parent page after turn-off:", (await P.text()).match(/(No code yet|A code is active)[^\n]*/)?.[0]);
await P.close?.(); await C.close?.();
summary(); process.exit(0);

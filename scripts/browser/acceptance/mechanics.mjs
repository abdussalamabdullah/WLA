// Physical ↔ digital mechanics end to end on staging (Plan §5): a QA mission
// built in the Admin UI with a variant code, a printable carrying it, a timed
// stage, a Kit QR scan-to-reveal gating a screen, a compass step with its
// manual route, and a code entry that can scan — then played as a learner.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { inflateSync } from "node:zlib";
// The text a PDF draws. WLA's embedded subset fonts store glyph ids, so each
// font's ToUnicode map turns them back into characters (D-101).
const drawnText = (bytes) => {
  const raw = Buffer.from(bytes); const streams = []; let i = 0;
  for (;;) { const s = raw.indexOf("stream", i); if (s < 0) break; const st = raw[s + 6] === 0x0d ? s + 8 : s + 7; const e = raw.indexOf("endstream", st); if (e < 0) break;
    try { streams.push(inflateSync(raw.subarray(st, e)).toString("latin1")); } catch {} i = e + 9; }
  const map = new Map();
  for (const t of streams.filter((x) => /begincmap/.test(x))) {
    for (const [, g, u] of t.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,})>/g)) map.set(g.toUpperCase(), String.fromCodePoint(...u.match(/.{4}/g).map((h) => parseInt(h, 16))));
  }
  return streams.filter((x) => !/begincmap/.test(x)).join("\n").replace(/<([0-9A-Fa-f]+)>/g, (_, h) => (h.match(/.{4}/g) || []).map((g) => map.get(g.toUpperCase()) ?? "").join(""));
};

const SLUG = "qa-mechanics-mission", TITLE = "QA MECHANICS MISSION";
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (path, init = {}) => (await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const BASE = "http://localhost:3100";

const b = await launch({ port: 9456 });
await b.viewport(1512, 950);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(700); };
const builder = `/admin/builder/${SLUG}/1`;

const DEFINITION = {
  variables: [{ key: "code", type: "string", visibility: "hidden" }],
  variants: [{ id: "river", label: "River", values: { code: "RIVER-7" } }],
  qr: [
    { key: "tower", label: "The tower card", action: "unlock", unlock: "tower" },
    { key: "kitcard", label: "The code card", action: "resource", resource: "Code card base" },
  ],
  prints: [{ key: "card", title: "Your code card", base: "Code card base", fields: [{ text: "Code: {{var.code}}", x: 20, y: 40, size: 20 }] }],
  completion: { ref: { visited: "code" }, op: "exists" },
};
const SCREENS = [
  ["intro", "content", "Before you start", { next: "timed", prints: ["card"] }],
  ["timed", "content", "Wait at the gate", { next: "tower", timer: { seconds: 25, visible: true, onExpire: "advance" } }],
  ["tower", "content", "The tower is open", { next: "dir", requires: { ref: { unlocked: "tower" }, op: "exists" }, otherwise: "dir" }],
  ["dir", "device_input", "Find the tower", { next: "code", prompt: "Which way is the tower from the gate?", label: "Point the top of your device at the tower.", outcomes: [{ id: "east", match: { min: 45, max: 135 } }], onNoMatch: { mode: "retry", fallbackAfter: 3, fallbackNext: "code" } }],
  ["code", "code_entry", "The code", { next: "finish", prompt: "What code is on your card?", scan: true, outcomes: [{ id: "ok", match: { values: ["RIVER-7"] } }], onNoMatch: { mode: "retry", fallbackAfter: 5, fallbackNext: "finish" } }],
  ["finish", "completion", "Mission complete", { message: "You used the card, the code and the compass." }],
];

console.log("\n--- A. Build and publish in the Admin UI ---");
await uiLogin(b, ...ACCOUNTS.admin);
await b.goto("/admin/builder", 800);
if (!(await main()).includes(TITLE)) {
  if (await b.has(/new mission|create a mission|start a new mission/i)) await b.click(/new mission|create a mission|start a new mission/i);
  await b.fill("#title", TITLE); await b.fill("#slug", SLUG);
  const lab = await b.eval("document.querySelector('select[name=lab]').options[1]?.value || document.querySelector('select[name=lab]').options[0].value");
  await b.fill("select[name=lab]", lab); await b.fill("#min_age", "8"); await b.fill("#max_age", "12");
  await b.click(/create/i, { selector: "button[type=submit]" });
  await b.waitUrl(new RegExp(builder), 40000);
}
await b.goto(builder, 1000);
if (!/This version is locked/.test(await main())) {
  await b.eval("document.querySelector('#definition-json').closest('details').open = true"); await sleep(150);
  await b.fill("#definition-json", JSON.stringify(DEFINITION, null, 2)); await sleep(200);
  await b.click(/^save mission logic$/i, { selector: "button" }); await settle();
  chk("mission logic saved (variant, QR codes, printable)", /Mission logic saved\./.test(await main()));
  for (const [i, [key, type, title, config]] of SCREENS.entries()) {
    await b.goto(builder, 900);
    if (new RegExp(`\\b${key} ·`).test(await main())) continue;
    await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
    await b.fill("#screen_key", key); await b.fill("#sequence", String((i + 1) * 10));
    await b.fill("#type", type); await sleep(250);
    await b.fill("#title", title); await b.fill("#body", "");
    await b.fill("#configuration-json", JSON.stringify(config, null, 2));
    await b.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle();
    chk(`builder: add ${type} "${key}"`, /Screen saved\./.test(await main()), (await main()).slice(0, 200));
  }
  await b.goto(builder, 1000);
  const mid = (await svc(`missions?slug=eq.${SLUG}&select=id`))[0].id;
  const hasBase = (await svc(`mission_resources?mission_id=eq.${mid}&version=eq.1&title=eq.${encodeURIComponent("Code card base")}&select=id`)).length > 0;
  if (!hasBase) {
    const KF = "form:has(input[name=can_view])";
    await b.click(/^add a resource$/i, { selector: "button" }); await sleep(300);
    await b.fill(`${KF} input[name=title]`, "Code card base"); await b.fill(`${KF} [name=description]`, "The card your code is printed on.");
    await b.setFile(`${KF} input[name=file]`, "/tmp/wla-qa/code-card-base.pdf");
    await b.click(/^add resource$/i, { selector: "button[type=submit]" }); await settle();
  }
  await b.goto(builder, 1000);
  await b.fill("#content", "A mission about using printed cards, codes and a compass."); await b.click(/^save parent note$/i, { selector: "button" }); await settle();

  // the printable QR sheet, from the draft
  await b.goto(`${builder}/qr`, 1000);
  const qrs = await b.eval("[...document.querySelectorAll('main svg[role=img]')].map(s=>s.getAttribute('aria-label'))");
  chk("the QR sheet renders a scannable code per definition", qrs.length === 2, JSON.stringify(qrs));
  chk("each code points at /q/<mission>/<code>", /\/q\/qa-mechanics-mission\/tower/.test(await main()));
  await b.viewport(390, 844); await sleep(200);
  const a = await b.audit();
  chk("QR sheet @390: no overflow or small targets", a.overflow <= 0 && !a.small.length, JSON.stringify({ o: a.overflow, s: a.small }));
  await b.viewport(1512, 950);

  // preview: the timer shows, the printable is named, the compass offers its manual route
  await b.goto(`${builder}/preview`, 1200);
  chk("preview: the printable is offered by name", /Print: Your code card/.test(await main()));
  await b.click(/^continue$/i, { selector: "main button" }); await sleep(400);
  chk("preview: a timed stage shows the time left", /0:2\d left/.test(await b.eval("(document.querySelector('[role=timer]')||{}).innerText||''")));

  await b.goto(builder, 1000);
  chk("mission QA: nothing blocks publishing", /Nothing is stopping this version being published/.test(await main()), (await main()).match(/Must fix[\s\S]{0,300}/)?.[0]);
  if (await b.has(/^submit for review$/i, "button")) { await b.click(/^submit for review$/i, { selector: "button" }); await settle(); await b.goto(builder, 1000); }
  await b.click(/^publish$/i, { selector: "button" }); await settle(); await b.goto(builder, 1000);
}
chk("v1 published and locked", /This version is locked/.test(await main()));
const mission = (await svc(`missions?slug=eq.${SLUG}&select=id,published`))[0];
chk("kept out of the public catalogue", mission.published === false);

console.log("\n--- B. Learner ---");
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const CHILD = `QA Mechanics ${Date.now().toString(36).slice(-5)}`;
const kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: CHILD, birth_year: 2015 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: mission.id, source: "admin", status: "active" }) });

// Anonymous visitors learn nothing.
const anonPrint = await fetch(`${BASE}/api/print/${SLUG}/card`, { redirect: "manual" });
chk("anonymous: the printable is not found", anonPrint.status === 404, String(anonPrint.status));
const anonQr = await fetch(`${BASE}/q/${SLUG}/tower`, { redirect: "manual" });
chk("anonymous: a QR scan asks to sign in and comes back", anonQr.status === 303 && /\/login\?next=%2Fq%2F/.test(anonQr.headers.get("location") || ""), `${anonQr.status} ${anonQr.headers.get("location")}`);

await uiLogin(b, q.email, q.password);
await b.goto("/academy/my-missions", 800);
if (await b.has(new RegExp(CHILD), "main button")) await b.click(new RegExp(CHILD), { selector: "main button" });
else { await b.click(/Missions/, { selector: "header button" }); await sleep(300); await b.click(new RegExp(CHILD), { selector: "header button, header [role=menuitem], header a" }); }
await sleep(1500);
await b.goto(`/academy/missions/${SLUG}`, 1000);
await b.click(/^(start|continue) mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000);
await b.waitText(/Before you start/, 20000);

const cookie = (await b.getCookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const link = await b.eval("([...document.querySelectorAll('main a')].find(a=>/Print: Your code card/.test(a.innerText))||{}).getAttribute?.('href')");
chk("the screen offers the printable made for this run", link === `/api/print/${SLUG}/card`, String(link));
const pdfRes = await fetch(`${BASE}${link}`, { headers: { cookie } });
const bytes = new Uint8Array(await pdfRes.arrayBuffer());
chk("the printable is a PDF, not cached", pdfRes.ok && /application\/pdf/.test(pdfRes.headers.get("content-type") || "") && /no-store/.test(pdfRes.headers.get("cache-control") || ""), `${pdfRes.status} ${pdfRes.headers.get("content-type")}`);
const doc = await PDFDocument.load(bytes);
chk("the printable keeps the approved base and is titled for the run", doc.getPageCount() === 1 && doc.getTitle() === "Your code card");
chk("the printable carries THIS run's variant code (a hidden variable)", drawnText(bytes).includes("Code: RIVER-7"));
const other = await fetch(`${BASE}/api/print/${SLUG}/nope`, { headers: { cookie } });
chk("an undeclared printable is not found", other.status === 404, String(other.status));

await b.click(/^continue$/i, { selector: "main button" }); await settle();
await b.waitText(/Wait at the gate/, 20000);
chk("a timed stage shows the time left by server time", /0:\d\d left/.test(await b.eval("(document.querySelector('[role=timer]')||{}).innerText||''")));

// Scan the tower card while waiting: the run gains the unlock, the child stays where they are.
await b.goto(`/q/${SLUG}/tower`, 1500);
chk("a QR scan returns the child to their mission", /\/academy\/missions\/qa-mechanics-mission\/active/.test(await b.url()), await b.url());
const prog = (await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${mission.id}&select=id,current_screen_key`))[0];
const st = (await svc(`mission_state?progress_id=eq.${prog.id}&select=state_data`))[0]?.state_data;
chk("scan-to-reveal: the unlock is recorded on the server", st?.unlocked?.includes("tower"), JSON.stringify(st?.unlocked));
chk("the scan did not move the child", prog.current_screen_key === "timed", prog.current_screen_key);
await b.goto(`/q/${SLUG}/kitcard`, 1500);
chk("a resource code opens the Mission Kit", /\/kit$/.test(await b.url()), await b.url());

await b.goto(`/academy/missions/${SLUG}/active`, 1000);
chk("when the time is up the stage moves on — through the unlocked tower", await b.waitText(/The tower is open/, 45000));
await b.click(/^continue$/i, { selector: "main button" }); await settle();

await b.waitText(/Which way is the tower/, 20000);
for (const [w, h] of [[390, 844], [1512, 950]]) {
  await b.viewport(w, h); await sleep(250);
  const a = await b.audit();
  chk(`device screen @${w}: no overflow or small targets`, a.overflow <= 0 && !a.small.length && !a.unlabelled.length, JSON.stringify({ o: a.overflow, s: a.small, u: a.unlabelled }));
}
await b.click(/do it without the compass/i, { selector: "main button" }); await sleep(300);
await b.click(/^east$/i, { selector: "main [role=radio]" });
await b.click(/^use this$/i, { selector: "main button" }); await settle();

await b.waitText(/What code is on your card/, 20000);
await b.click(/scan it with the camera/i, { selector: "main button" }); await sleep(1500);
const camText = await main();
chk("no camera here: the child is told to type it instead (fallback)", /Type it in instead/.test(camText) || /Point the camera at the code/.test(camText), camText.slice(0, 300));
if (await b.has(/stop the camera/i, "main button")) await b.click(/stop the camera/i, { selector: "main button" });
await b.fill("main input", "river-7"); await b.click(/^check$/i, { selector: "main button" });
await b.waitUrl(/\/complete/, 40000);
chk("the mission completes with the code from the printed card", /\/complete/.test(await b.url()), await b.url());

const after = (await svc(`mission_state?progress_id=eq.${prog.id}&select=state_data`))[0]?.state_data;
chk("the compass step was graded on the server (manual route)", after?.outcomes?.dir === "east", JSON.stringify(after?.outcomes));
const ev = await svc(`analytics_events?mission_id=eq.${mission.id}&select=name,detail&order=occurred_at.desc&limit=100`);
const evs = Array.isArray(ev) ? ev : [];
chk("analytics: the scan, the print and the fallback are reported structurally", evs.some((e) => e.name === "qr_scanned") && evs.some((e) => e.name === "kit_opened" && e.detail?.source === "print") && evs.some((e) => e.name === "device_fallback_used"), JSON.stringify(evs.slice(0, 5)));

await b.close?.();
summary();

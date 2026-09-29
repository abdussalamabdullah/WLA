// Admin no-code lifecycle, driven entirely through the Admin UI (plus learner UI for E).
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const PH = (process.env.PHASES ?? "A,B,C,D,E,F,G").split(",");
const SLUG = "autonomous-qa-test-mission", TITLE = "AUTONOMOUS QA TEST MISSION";
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), ANON = /NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)[1].trim();
const SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const svc = async (path) => (await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const builderKid = kids.find((k) => k.display_name === "QA Builder Child");
mkdirSync("/tmp/wla-qa", { recursive: true });
const PDF = "/tmp/wla-qa/qa-kit.pdf";
if (!existsSync(PDF)) writeFileSync(PDF, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const b = await launch({ port: 9440 });
await b.viewport(1512, 950);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 120; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(500); };
const builderUrl = (v) => `/admin/builder/${SLUG}/${v}`;

async function addScreen(s) {
  await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
  await b.fill("#screen_key", s.key); await b.fill("#sequence", String(s.seq));
  await b.fill("#type", s.type); await sleep(250);
  await b.fill("#title", s.title ?? ""); await b.fill("#body", s.body ?? "");
  await b.fill("#configuration", JSON.stringify(s.config, null, 2));
  await b.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle();
  const t = await main();
  const ok = /Screen saved\./.test(t);
  chk(`add screen "${s.key}" (${s.type})`, ok, ok ? "" : t.slice(t.indexOf("Screens"), t.indexOf("Screens") + 300).replace(/\n+/g, " | "));
  if (await b.has(/^cancel$/i, "button")) { await b.click(/^cancel$/i, { selector: "button" }); await sleep(200); }
}

const SCREENS = [
  { key: "intro", seq: 10, type: "content", title: "The open gate", body: "Someone has left the school gate open at break time.", config: { next: "decide" } },
  { key: "decide", seq: 20, type: "choice", title: "Decision", body: "", config: { prompt: "What do you do?", confirmLabel: "Confirm", options: [
    { id: "tell", label: "Tell a teacher", next: "path_tell" }, { id: "close", label: "Close it yourself", next: "path_close" }] } },
  { key: "path_tell", seq: 30, type: "content", title: "What happened", body: "The teacher thanks you and checks the gate herself.", config: { next: "wrap" } },
  { key: "path_close", seq: 40, type: "content", title: "What happened", body: "The gate is shut, but nobody knows it was open.", config: { next: "wrap" } },
  { key: "wrap", seq: 50, type: "response", title: "Looking back", body: "", config: { prompt: "What did you notice?", next: "finish" } },
  { key: "finish", seq: 60, type: "completion", title: "Mission complete", body: "", config: { message: "You finished the QA mission.", trailEntries: [{ type: "digital", title: "What I noticed", fromResponse: "wrap" }] } },
];
const RULE = { type: "conditions", conditions: [{ kind: "response_exists", screenKey: "wrap" }] };

// ------------------------------------------------------------------ A
await uiLogin(b, ...ACCOUNTS.admin);
if (PH.includes("A")) {
  console.log("\n--- A. Admin navigation ---");
  const routes = ["/admin", "/admin/missions", "/admin/builder", "/admin/parents", "/admin/children", "/admin/orders", "/admin/activity", "/admin/analytics", "/admin/settings", "/admin/help"];
  for (const r of routes) {
    await b.goto(r, 600);
    const h1 = await b.h1s(), t = await main(), a = await b.audit();
    console.log(`  ${r.padEnd(18)} h1=${JSON.stringify(h1)} overflow=${a.overflow} skip=${a.skip} small=${a.small.length} unlabelled=${a.unlabelled}`);
    chk(`${r}: renders one h1, no error state`, h1.length === 1 && !/couldn.t load|something went wrong|error/i.test(t), t.slice(0, 160).replace(/\n+/g, " | "));
  }
  await b.goto("/admin/parents", 600);
  chk("Parents lists the review families", /wla-review-parent/.test(await main()));
  await b.goto("/admin/missions", 600);
  chk("catalogue lists Six Names as not in the public catalogue", /six names/i.test(await main()));
}

// ------------------------------------------------------------------ B
if (PH.includes("B")) {
  console.log("\n--- B. Create and build v1 in the UI ---");
  await b.goto("/admin/builder", 600);
  if (!(await main()).includes(TITLE)) {
    if (await b.has(/new mission|create a mission|start a new mission/i)) await b.click(/new mission|create a mission|start a new mission/i);
    await b.fill("#title", TITLE); await b.fill("#slug", SLUG);
    const lab = await b.eval("document.querySelector('select[name=lab]').options[1]?.value || document.querySelector('select[name=lab]').options[0].value");
    await b.fill("select[name=lab]", lab); await b.fill("#min_age", "8"); await b.fill("#max_age", "12");
    await b.click(/create/i, { selector: "button[type=submit]" });
    await b.waitUrl(new RegExp(builderUrl(1)), 40000);
  } else await b.goto(builderUrl(1), 600);
  chk("mission created and v1 draft opened", (await b.url()).startsWith(builderUrl(1)), await b.url());
  await b.goto(builderUrl(1), 600);
  const existing = await main();
  for (const s of SCREENS) if (!new RegExp(`\\b${s.key} ·`).test(existing)) await addScreen(s);
  // edit a screen
  await b.click(/^edit$/i, { selector: "li button", nth: 0 }); await sleep(300);
  await b.fill("#title", "The open gate (edited)");
  await b.click(/^save screen$/i, { selector: "button[type=submit]" }); await settle();
  chk("edit an existing screen", /Screen saved\./.test(await main()) || /edited/.test(await main()));
  await b.click(/^close$/i, { selector: "li button" }).catch(() => {});
  // add, reorder, remove a temporary screen
  await addScreen({ key: "temp", seq: 70, type: "content", title: "Temporary", body: "x", config: { next: "wrap" } });
  await b.goto(builderUrl(1), 600);
  chk("an unreachable screen blocks publishing", /No path from the first screen reaches this screen/.test(await main()));
  const before = await b.eval("[...document.querySelectorAll('ol li')].map(li=>li.innerText.split('\\n')[0]).join(',')");
  await b.click(/^move temp up$/i, { selector: "button" }); await settle(); await b.goto(builderUrl(1), 600);
  const after = await b.eval("[...document.querySelectorAll('ol li')].map(li=>li.innerText.split('\\n')[0]).join(',')");
  chk("reorder moves a screen", before !== after, `${before} → ${after}`);
  await b.click(/^remove$/i, { selector: "ol li:has(p) button", nth: await b.eval("[...document.querySelectorAll('ol li')].findIndex(li=>/\\btemp ·/.test(li.innerText))") });
  await b.click(/^confirm$/i, { selector: "ol li button" }); await settle(); await b.goto(builderUrl(1), 600);
  chk("remove a draft screen", !/\btemp ·/.test(await main()));
  // completion rule
  await b.fill("#rule", JSON.stringify(RULE, null, 2));
  await b.click(/^save completion rule$/i, { selector: "button" }); await settle();
  chk("completion rule saved", /Completion rule saved/.test(await main()));
  // Kit
  await b.goto(builderUrl(1), 600);
  if (!/QA gate checklist/.test(await main())) {
    await b.click(/^add a resource$/i, { selector: "button" }); await sleep(300);
    await b.fill("#title", "QA gate checklist"); await b.fill("#description", "One page to print.");
    await b.setFile("#file", PDF);
    await b.click(/^add resource$/i, { selector: "button[type=submit]" }); await settle();
    chk("Kit resource uploaded through the UI", /Resource saved/.test(await main()), (await main()).slice(0, 100));
    await b.goto(builderUrl(1), 600);
  }
  const fileHref = await b.eval("([...document.querySelectorAll('a')].find(a=>/^Open file/.test(a.innerText))||{}).href||null");
  chk("draft Kit file has an Open file link", Boolean(fileHref));
  if (fileHref) { const r = await fetch(fileHref); chk("Open file downloads the draft PDF (admin session)", r.ok && /pdf/.test(r.headers.get("content-type") || ""), `${r.status}`); }
  // edit resource metadata
  await b.click(/^edit$/i, { selector: "section li button", nth: await b.eval("[...document.querySelectorAll('li')].filter(li=>li.querySelector('button')&&/\\bedit\\b/i.test(li.innerText)).findIndex(li=>/QA gate checklist/.test(li.innerText))") }).catch(() => {});
  // Parent note + preview
  await b.goto(builderUrl(1), 600);
  await b.fill("#content", "Talk about who needs to know when something is unsafe.\n\n- Ask what they noticed.\n- There is no right answer.");
  await b.click(/^preview$/i, { selector: "button" }); await sleep(400);
  chk("Parent Note preview renders the typed text", await b.eval("(document.getElementById('parent-note-preview')||{}).innerText?.includes('who needs to know') || false"));
  await b.click(/^save parent note$/i, { selector: "button" }); await settle();
  chk("Parent Note saved", /Parent note saved/.test(await main()));
  await b.goto(builderUrl(1), 600);
  chk("validation: nothing blocks publishing", /Nothing is stopping this version being published/.test(await main()), (await main()).match(/Review[\s\S]{0,400}/)?.[0]?.replace(/\n+/g, " | "));
  const a = await b.audit();
  chk("builder page: one h1, no overflow, controls labelled", a.h1 === 1 && a.overflow <= 0 && a.unlabelled.length === 0, JSON.stringify(a));
}

// ------------------------------------------------------------------ C
if (PH.includes("C")) {
  console.log("\n--- C. Learner Preview ---");
  const m = (await svc(`missions?slug=eq.${SLUG}&select=id`))[0];
  const runsBefore = (await svc(`mission_progress?mission_id=eq.${m.id}&select=id`)).length;
  for (const [opt, body] of [["Tell a teacher", "teacher thanks you"], ["Close it yourself", "nobody knows it was open"]]) {
    await b.goto(`${builderUrl(1)}/preview`, 600);
    chk("preview frame says nothing is saved", /Preview[\s\S]*nothing here[\s\S]*saved/i.test(await b.text()));
    await b.click(/^continue$/i, { selector: "main button" }); await sleep(300);
    await b.click(opt, { selector: "main button" }); await b.click(/^confirm$/i, { selector: "main button" }); await sleep(300);
    chk(`preview branch "${opt}" shows its own consequence`, (await main()).includes(body));
    const other = opt === "Tell a teacher" ? "nobody knows it was open" : "teacher thanks you";
    chk(`preview branch "${opt}" does not show the other consequence`, !(await main()).includes(other));
    await b.click(/^continue$/i, { selector: "main button" }); await sleep(300);
    await b.fill("main textarea, main input:not([type=hidden]):not([type=checkbox]):not([type=radio])", "QA preview answer");
    await b.click(/^save and continue$/i, { selector: "main button" }); await sleep(500);
    chk(`preview reaches completion via the rule (${opt})`, /Mission complete/.test(await main()), (await main()).slice(0, 160));
  }
  const runsAfter = (await svc(`mission_progress?mission_id=eq.${m.id}&select=id`)).length;
  const events = await svc(`analytics_events?mission_id=eq.${m.id}&select=id`);
  chk("preview wrote no learner progress", runsAfter === runsBefore, `${runsBefore}→${runsAfter}`);
  chk("preview emitted no learner analytics", Array.isArray(events) && events.length === 0, JSON.stringify(events).slice(0, 80));
  chk("preview created no entitlement", (await svc(`mission_entitlements?mission_id=eq.${m.id}&select=id`)).length === 0);
}

// ------------------------------------------------------------------ D
if (PH.includes("D")) {
  console.log("\n--- D. Review and publish v1 ---");
  await b.goto(builderUrl(1), 600);
  if (await b.has(/^submit for review$/i, "button")) { await b.click(/^submit for review$/i, { selector: "button" }); await settle(); await b.goto(builderUrl(1), 600); }
  chk("submitted for review (status In review)", /in review/i.test(await main()));
  await b.click(/^publish$/i, { selector: "button" }); await settle(); await b.goto(builderUrl(1), 600);
  chk("v1 published; builder now read-only", /This version is locked/.test(await main()) && !(await b.has(/^add a screen$/i, "button")));
  // published content cannot be edited — even by an admin calling the API directly
  const tok = (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: ACCOUNTS.admin[0], password: ACCOUNTS.admin[1] }) })).json()).access_token;
  const m = (await svc(`missions?slug=eq.${SLUG}&select=id`))[0];
  const H = { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
  const tries = {
    screen: await fetch(`${SB}/rest/v1/rpc/admin_upsert_screen`, { method: "POST", headers: H, body: JSON.stringify({ p_mission_id: m.id, p_version: 1, p_screen_key: "intro", p_type: "content", p_title: "tampered", p_body: "x", p_sequence: 10, p_configuration: { next: "decide" } }) }),
    note: await fetch(`${SB}/rest/v1/rpc/admin_save_parent_note`, { method: "POST", headers: H, body: JSON.stringify({ p_mission_id: m.id, p_version: 1, p_content: "tampered", p_document_path: null }) }),
    rule: await fetch(`${SB}/rest/v1/rpc/admin_set_completion_rule`, { method: "POST", headers: H, body: JSON.stringify({ p_mission_id: m.id, p_version: 1, p_rule: { type: "screen_reached", screenKey: "intro" } }) }),
  };
  for (const [k, r] of Object.entries(tries)) chk(`published v1 ${k} cannot be changed, even via the API`, !r.ok, String(r.status));
  // catalogue: free + published so a parent can get it (controlled test publication)
  await b.goto(`/admin/missions/${SLUG}`, 600);
  await b.check("input[name=is_free]", true); await b.check("input[name=published]", true);
  await b.click(/^save changes$/i, { selector: "button" }); await settle();
  chk("mission details saved: free, in catalogue (temporary)", (await svc(`missions?slug=eq.${SLUG}&select=published,is_free`))[0]?.published === true);
}

// ------------------------------------------------------------------ E
if (PH.includes("E")) {
  console.log("\n--- E. Learner acquires and completes it ---");
  await uiLogin(b, q.email, q.password);
  await b.goto(`/missions/${SLUG}`, 600);
  chk("public Mission Detail exists once published", (await b.h1s())[0] === TITLE, JSON.stringify(await b.h1s()));
  await b.goto(`/purchase/${SLUG}`, 600);
  await b.eval(`(()=>{const r=[...document.querySelectorAll('input[name=childId]')].find(i=>i.value==='${builderKid.id}'); if(r) r.click();})()`);
  await b.click(/get|add|free|continue/i, { selector: "main button[type=submit]" }); await settle();
  await sleep(1500);
  const ent = await svc(`mission_entitlements?child_id=eq.${builderKid.id}&select=source,status,missions(slug)`);
  chk("free mission granted to the chosen child (service-side)", ent.some((e) => e.missions?.slug === SLUG && e.source === "free"), JSON.stringify(ent));
  // act as the child: parent switches to them
  await b.goto("/academy/my-missions", 600);
  if (await b.has(/QA Builder Child/, "main button")) await b.click(/QA Builder Child/, { selector: "main button" });
  else { await b.click(/Missions/, { selector: "header button" }); await sleep(300); await b.click(/QA Builder Child/, { selector: "header button, header [role=menuitem], header a" }); }
  await b.waitText(/AUTONOMOUS QA TEST MISSION/i, 30000);
  await b.goto(`/academy/missions/${SLUG}`, 600);
  await b.click(/^start mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000); await b.goto(`/academy/missions/${SLUG}/active`, 600);
  await b.click(/^continue$/i, { selector: "main button" }); await settle();
  await b.click("Close it yourself", { selector: "main button" }); await b.click(/^confirm$/i, { selector: "main button" }); await settle();
  chk("learner sees the chosen consequence", (await main()).includes("nobody knows it was open"));
  await b.click(/^continue$/i, { selector: "main button" }); await settle();
  await b.fill("main textarea, main input:not([type=hidden]):not([type=checkbox]):not([type=radio])", "The gate was open and I shut it.");
  await b.click(/^save and continue$/i, { selector: "main button" }); await b.waitUrl(/\/complete/, 40000);
  chk("learner completes the QA mission", /\/complete/.test(await b.url()), await b.url());
  await b.goto(`/academy/missions/${SLUG}/trail`, 800);
  chk("Trail holds the child's own answer", (await main()).includes("The gate was open and I shut it."), (await main()).slice(0, 200));
  await b.goto(`/academy/missions/${SLUG}/kit`, 1000);
  chk("Kit shows the published resource to the learner", /QA gate checklist/.test(await main()));
  const prog = await svc(`mission_progress?child_id=eq.${builderKid.id}&select=mission_version,status,missions!inner(slug)&missions.slug=eq.${SLUG}`);
  chk("run is pinned to v1 and complete", prog[0]?.mission_version === 1 && prog[0]?.status === "complete", JSON.stringify(prog));
  await uiLogin(b, ...ACCOUNTS.admin);
}

// ------------------------------------------------------------------ F
if (PH.includes("F")) {
  console.log("\n--- F. New version; immutability; pinning; draft files private ---");
  await b.goto(`/admin/missions/${SLUG}`, 600);
  await b.click(/create a new version|new version/i, { selector: "button" }); await settle();
  await b.goto(builderUrl(2), 600);
  chk("v2 draft opens editable", (await b.has(/^add a screen$/i, "button")));
  const t2 = await main();
  chk("v2 carried the Kit and Parent Note over", /QA gate checklist/.test(t2) && (await b.eval("document.querySelector('#content')?.value||''")).includes("who needs to know"));
  // edit a consequence in v2 and replace the Kit file (new object under the mission folder)
  const idx = await b.eval("[...document.querySelectorAll('ol li')].findIndex(li=>/\\bpath_close ·/.test(li.innerText))");
  await b.click(/^edit$/i, { selector: "ol li button", nth: idx }); await sleep(300);
  await b.fill("#body", "The gate is shut. Next time you tell someone too.");
  await b.click(/^save screen$/i, { selector: "button[type=submit]" }); await settle();
  chk("v2 screen edited", /Screen saved/.test(await main()));
  await b.goto(builderUrl(2), 600);
  await b.eval("[...document.querySelectorAll('li')].find(li=>/QA gate checklist/.test(li.innerText)&&/Open file/.test(li.innerText))?.querySelector('button:not([aria-label])')?.click()");
  await sleep(400);
  const editOpen = await b.eval("!!document.querySelector('#file')");
  if (editOpen) {
    await b.setFile("#file", PDF);
    await b.click(/^save resource$/i, { selector: "button[type=submit]" }); await settle();
  }
  const v2res = await svc(`mission_resources?select=version,storage_path,missions!inner(slug)&missions.slug=eq.${SLUG}&order=version`);
  const v1path = v2res.find((r) => r.version === 1)?.storage_path, v2path = v2res.find((r) => r.version === 2)?.storage_path;
  chk("v2 Kit file replaced without touching v1's", editOpen && v1path && v2path && v1path !== v2path, `${v1path} / ${v2path}`);
  // entitled learner family cannot read the v2 draft file; can read v1's
  const ptok = (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: q.email, password: q.password }) })).json()).access_token;
  const sign = async (p) => (await fetch(`${SB}/storage/v1/object/sign/mission-resources/${p}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ptok}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }) })).status;
  if (v1path) chk("entitled family can read the RELEASED v1 Kit file", (await sign(v1path)) === 200);
  if (v2path) chk("entitled family cannot read the DRAFT v2 Kit file (D-68)", (await sign(v2path)) !== 200);
  // admin cannot overwrite/delete the published v1 file
  const atok = (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: ACCOUNTS.admin[0], password: ACCOUNTS.admin[1] }) })).json()).access_token;
  const del = await (await fetch(`${SB}/storage/v1/object/mission-resources`, { method: "DELETE", headers: { apikey: ANON, Authorization: `Bearer ${atok}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [v1path] }) })).json();
  chk("admin cannot delete the published v1 Kit file", Array.isArray(del) && del.length === 0, JSON.stringify(del).slice(0, 80));
  // publish v2 (validate → publish), v1 archived, the finished run stays on v1
  await b.goto(builderUrl(2), 600);
  await b.click(/^publish$/i, { selector: "button" }); await settle();
  const vs = await svc(`mission_versions?select=version,status,missions!inner(slug)&missions.slug=eq.${SLUG}&order=version`);
  chk("v2 published and v1 archived", vs.find((v) => v.version === 1)?.status === "archived" && vs.find((v) => v.version === 2)?.status === "published", JSON.stringify(vs.map((v) => [v.version, v.status])));
  const prog = await svc(`mission_progress?child_id=eq.${builderKid.id}&select=mission_version,missions!inner(slug)&missions.slug=eq.${SLUG}`);
  chk("existing learner record stays pinned to v1 (D-17)", prog[0]?.mission_version === 1, JSON.stringify(prog));
  if (v2path) chk("the v2 file is readable by the family once released", (await sign(v2path)) === 200);
}

// ------------------------------------------------------------------ G
if (PH.includes("G")) {
  console.log("\n--- G. Archive, retire, clean up ---");
  await b.goto(`/admin/missions/${SLUG}`, 600);
  await b.check("input[name=published]", false); await b.check("input[name=is_free]", false);
  await b.click(/^save changes$/i, { selector: "button" }); await settle();
  chk("QA mission removed from the public catalogue", (await svc(`missions?slug=eq.${SLUG}&select=published`))[0]?.published === false);
  if (await b.has(/^archive/i, "button")) { await b.click(/^archive/i, { selector: "button" }); await settle(); }
  const vs = await svc(`mission_versions?select=version,status,missions!inner(slug)&missions.slug=eq.${SLUG}&order=version`);
  chk("published version archived through the UI", vs.every((v) => v.status === "archived"), JSON.stringify(vs.map((v) => [v.version, v.status])));
  await b.goto(`/admin/missions/${SLUG}`, 600);
  const delText = await main();
  chk("delete is refused while learner records exist", !/^delete mission$/im.test(delText) || /can.t be deleted|has been played|learner/i.test(delText), delText.match(/Delete[\s\S]{0,200}/)?.[0]?.replace(/\n+/g, " | "));
}

// ------------------------------------------------------------------ H
if (PH.includes("H")) {
  console.log("\n--- H. Retire: remove the learner record in the parent UI, then safe-delete in the admin UI ---");
  const m = (await svc(`missions?slug=eq.${SLUG}&select=id`))[0];
  const paths = (await svc(`mission_resources?mission_id=eq.${m.id}&select=storage_path`)).map((r) => r.storage_path);
  await uiLogin(b, q.email, q.password);
  await b.goto("/account/children", 600);
  const idx = await b.eval("[...document.querySelectorAll('li')].findIndex(li=>/QA Builder Child/.test(li.innerText))");
  await b.eval(`[...document.querySelectorAll('li')][${idx}].querySelectorAll('button').forEach(x=>{ if(/^remove$/i.test(x.innerText.trim())) x.click(); })`);
  await sleep(600);
  await b.click(/^remove profile$/i, { selector: "button" });
  await sleep(2500); await b.goto("/account/children", 600);
  chk("parent removed the QA Builder Child in the UI", !/QA Builder Child/.test(await main()));
  await uiLogin(b, ...ACCOUNTS.admin);
  await b.goto(`/admin/missions/${SLUG}`, 600);
  chk("with no learner records left, Delete is offered", /No child has ever been given this mission/.test(await main()), (await main()).match(/learner record[^.]*\./)?.[0]);
  await b.click(/^delete this mission$/i, { selector: "button" }); await sleep(300);
  await b.click(/^yes, delete it$/i, { selector: "button" }); await settle(); await sleep(1500);
  chk("QA mission safely deleted through the admin UI", (await svc(`missions?slug=eq.${SLUG}&select=id`)).length === 0);
  const atok = (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: ACCOUNTS.admin[0], password: ACCOUNTS.admin[1] }) })).json()).access_token;
  const del = await (await fetch(`${SB}/storage/v1/object/mission-resources`, { method: "DELETE", headers: { apikey: ANON, Authorization: `Bearer ${atok}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [...new Set(paths)] }) })).json();
  chk("its now-orphaned Kit files removed by the admin session (D-68)", Array.isArray(del) && del.length === new Set(paths).size, JSON.stringify(del).slice(0, 120));
  const left = await svc(`mission_versions?mission_id=eq.${m.id}&select=version`);
  chk("no versions, screens or resources left behind", left.length === 0 && (await svc(`mission_screens?mission_id=eq.${m.id}&select=screen_key`)).length === 0);
}

await b.close();
process.exit(summary() ? 1 : 0);

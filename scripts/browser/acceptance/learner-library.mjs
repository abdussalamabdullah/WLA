// The interaction library as a LEARNER on staging: publish the QA library
// mission (v1, kept out of the public catalogue), give one QA child a fixture
// entitlement, and play every screen through the real server path — grading,
// projection, media signing, pause/resume and completion.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SLUG = "qa-library-mission", CHILD = `QA Library ${Date.now().toString(36).slice(-5)}`;
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (path, init = {}) => (await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const PDF = "/tmp/wla-qa/qa-kit.pdf";
if (!existsSync(PDF)) writeFileSync(PDF, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const b = await launch({ port: 9454 });
await b.viewport(1512, 950);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(700); };
const builder = `/admin/builder/${SLUG}/1`;
const mission = (await svc(`missions?slug=eq.${SLUG}&select=id,published`))[0];

console.log("\n--- A. Publish v1 (not in the catalogue) ---");
await uiLogin(b, ...ACCOUNTS.admin);
await b.goto(builder, 1000);
if (!/This version is locked/.test(await main())) {
  if (!/QA library kit/.test(await main())) {
    await b.click(/^add a resource$/i, { selector: "button" }); await sleep(300);
    const KF = "form:has(input[name=can_view])";
    await b.fill(`${KF} input[name=title]`, "QA library kit"); await b.fill(`${KF} [name=description]`, "One page to print.");
    await b.setFile(`${KF} input[name=file]`, PDF);
    await b.click(/^add resource$/i, { selector: "button[type=submit]" }); await settle();
    await b.goto(builder, 1000);
  }
  await b.fill("#content", "Every screen here is a kind of interaction. There is no score.");
  await b.click(/^save parent note$/i, { selector: "button" }); await settle();
  await b.goto(builder, 1000);
  const ready = /Nothing is stopping this version being published/.test(await main());
  chk("mission QA: nothing blocks publishing the library mission", ready, (await main()).match(/Must fix[\s\S]{0,400}/)?.[0]?.replace(/\n+/g, " | "));
  if (await b.has(/^submit for review$/i, "button")) { await b.click(/^submit for review$/i, { selector: "button" }); await settle(); await b.goto(builder, 1000); }
  await b.click(/^publish$/i, { selector: "button" }); await settle(); await b.goto(builder, 1000);
}
chk("v1 is published and locked", /This version is locked/.test(await main()));
chk("the mission stays out of the public catalogue", (await svc(`missions?slug=eq.${SLUG}&select=published`))[0]?.published === false);

console.log("\n--- B. Fixture: one QA child entitled ---");
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
let kid = (await svc(`child_profiles?select=id,display_name&parent_id=eq.${parent.id}&display_name=eq.${encodeURIComponent(CHILD)}`))[0];
if (!kid) kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: CHILD, birth_year: 2015 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ child_id: kid.id, mission_id: mission.id, source: "admin", status: "active" }) });
chk("QA child entitled (fixture, source admin)", (await svc(`mission_entitlements?child_id=eq.${kid.id}&mission_id=eq.${mission.id}&select=status`))[0]?.status === "active");

console.log("\n--- C. Play as the learner ---");
await uiLogin(b, q.email, q.password);
await b.goto("/academy/my-missions", 800);
if (await b.has(new RegExp(CHILD), "main button")) await b.click(new RegExp(CHILD), { selector: "main button" });
else { await b.click(/Missions/, { selector: "header button" }); await sleep(300); await b.click(new RegExp(CHILD), { selector: "header button, header [role=menuitem], header a" }); }
await sleep(1500);
await b.goto(`/academy/missions/${SLUG}`, 1000);
await b.click(/^(start|continue) mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000);
const active = `/academy/missions/${SLUG}/active`;

const SECRETS = ["open the gate", "onNoMatch", "fallbackNext", "ramp_height", "\"outcomes\"", "storeAs", "flies past the target", "\"next\":", "moon\",\"sun"];
async function freshAndCheck(label) {
  // A full load: the server-rendered payload is what a child could read in the source.
  await b.goto(active, 1200);
  const html = await b.eval("document.documentElement.outerHTML");
  const leaked = SECRETS.filter((s) => html.includes(s));
  chk(`${label}: no answer, route, binding or rule in the page source`, leaked.length === 0, leaked.join(", "));
}
const at = (re) => b.waitText(re, 20000);
const btn = async (re) => { await b.click(re, { selector: "main button" }); await settle(); };
const named = async (name) => { const ok = await b.eval(`(() => { const e=[...document.querySelectorAll('main button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(name)} && !x.disabled); if(!e) return false; e.click(); return true; })()`); if (!ok) throw new Error("no " + name); await sleep(200); };

await at(/What the bridge looked like/);
for (let i = 0; i < 40 && !(await b.eval("[...document.querySelectorAll('main figure img')].every(i=>i.complete)")); i++) await sleep(250);
const imgs = await b.eval("[...document.querySelectorAll('main figure img')].map(i=>({src:i.src, ok:i.complete&&i.naturalWidth>0, alt:i.alt}))");
chk("learner media: signed for this screen, loads, has text alternatives", imgs.length >= 2 && imgs.every((i) => /\/sign\/mission-media\//.test(i.src) && i.ok && i.alt.length > 5), JSON.stringify(imgs.map((i) => [i.ok, i.src.slice(0, 70)])));
await btn(/^continue$/i);

await at(/Where did the water get in/); await freshAndCheck("hotspot (asset image)");
chk("learner: an asset: image in an interaction is signed", await b.eval("/\\/sign\\/mission-media\\//.test(document.querySelector('main figure img').src)"));
await b.click("The arch", { selector: "main button:not([aria-hidden])" }); await btn(/^done$/i);

await at(/How many steps/); await freshAndCheck("numeric");
await b.fill("main input", "5"); await btn(/^enter$/i);
chk("server grading: a miss is guidance and nothing moves", /Count again from the gate/.test(await main()) && /How many steps/.test(await main()));
await b.fill("main input", "15"); await btn(/^enter$/i);

await at(/What does the message say/); await freshAndCheck("code");
// Pause and resume: leave and come back to the same place.
await b.goto(`/academy/missions/${SLUG}`, 800); await b.click(/^continue mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000);
chk("pause/resume returns to the same screen", await at(/What does the message say/));
await b.fill("main input", "Open, the GATE"); await btn(/^check$/i);

await at(/symbols in the order/); await freshAndCheck("tokens");
for (const s of ["Moon", "Sun", "Star"]) await b.click(new RegExp(`${s}$`), { selector: "main button" });
await btn(/^check$/i);

await at(/order you would do them/); await freshAndCheck("arrange");
await btn(/^done$/i);
await at(/Sort what you found/);
await b.click(/^inside$/i, { selector: "main [role=radio]", nth: 0 }); await b.click(/^outside$/i, { selector: "main [role=radio]", nth: 1 }); await btn(/^done$/i);
await at(/Match each clue/);
const sel = await b.eval("[...document.querySelectorAll('main select')].map(s=>s.id)");
await b.fill(`#${sel[0]}`, "pond"); await b.fill(`#${sel[1]}`, "gate"); await btn(/^done$/i);
await at(/Share out 4 sandbags/);
for (let i = 0; i < 2; i++) { await named("More North wall"); await named("More South wall"); }
await btn(/^done$/i);
await at(/carry two things/);
await b.click("Rope", { selector: "main button" }); await b.click("Map", { selector: "main button" }); await btn(/^take these$/i);
await at(/Compare the two plans/);
await b.click("Plan B", { selector: "main fieldset button" }); await btn(/^continue$/i);
await at(/Rate each plan/);
await b.click(/^ok$/i, { selector: "main [role=radio]", nth: 0 }); await b.click(/^weak$/i, { selector: "main [role=radio]", nth: 1 });
await b.click("Plan A", { selector: "main fieldset button" }); await btn(/^continue$/i);
await at(/carries the most weight/);
await b.click("The towers", { selector: "main button:not([aria-hidden])" }); await btn(/^done$/i);
await at(/Sketch your plan/);
await btn(/drew it on paper/i);
await at(/route from the camp/);
await b.click(/^stream$/i, { selector: "main button" }); await b.click(/^wood$/i, { selector: "main button" }); await b.click(/^lookout$/i, { selector: "main button" }); await btn(/^done$/i);
await at(/depend on each other/);
await b.click(/^sun$/i, { selector: "main button" }); await b.click(/^plant$/i, { selector: "main button" }); await btn(/^done$/i);
await at(/Continue the pattern/);
await named("Row 1, column 3: empty"); await btn(/^check$/i);

await at(/Set the ramp/); await freshAndCheck("simulation");
for (let i = 0; i < 4; i++) await named("More Ramp height");
await btn(/^run it$/i);
chk("server-decided readout after a run", /Run 1/.test(await main()) && /flies past the target/.test(await main()));
await btn(/^continue$/i);

await at(/Place each clue/);
await b.click(/^sure about$/i, { selector: "main [role=radio]", nth: 0 });
await b.click(/^not sure yet$/i, { selector: "main [role=radio]", nth: 1 });
await btn(/^save the board$/i);
await at(/Look at your board again/);
await freshAndCheck("workspace review");
chk("the board persists across screens and reloads", /Sure about[\s\S]*The torn note/.test(await main()) && /Not sure yet[\s\S]*The footprint/.test(await main()));
await b.click(/^continue$/i, { selector: "main button" });
await b.waitUrl(/\/complete/, 40000);
chk("the learner completes the library mission", /\/complete/.test(await b.url()), await b.url());

console.log("\n--- D. What the server recorded ---");
const prog = (await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${mission.id}&select=id,status,mission_version`))[0];
chk("run complete, pinned to v1", prog?.status === "complete" && prog?.mission_version === 1, JSON.stringify(prog));
const st = (await svc(`mission_state?progress_id=eq.${prog.id}&select=state_data`))[0]?.state_data ?? {};
chk("outcomes recorded server-side", st.outcomes?.num === "close" && st.outcomes?.code === "solved" && st.outcomes?.tokens === "found", JSON.stringify(st.outcomes));
chk("the inventory persisted in its variable", JSON.stringify(st.variables?.pack) === JSON.stringify(["rope", "map"]), JSON.stringify(st.variables));
chk("hidden variables are not in the family-readable state", !("ramp_height" in (st.variables ?? {})));
chk("the workspace persisted under its board key", st.workspaces?.board?.placements?.note === "sure", JSON.stringify(st.workspaces));
const resp = await svc(`mission_responses?progress_id=eq.${prog.id}&select=screen_key,value`);
chk("a sketch done on paper stores no drawing", JSON.stringify(resp.find((r) => r.screen_key === "sketch")?.value) === '"paper"', JSON.stringify(resp.find((r) => r.screen_key === "sketch")));
const evRaw = await svc(`analytics_events?run_key=not.is.null&select=name,detail&mission_id=eq.${mission.id}&order=occurred_at.desc&limit=200`);
const ev = Array.isArray(evRaw) ? evRaw : [];
chk("analytics carry outcomes without free text", ev.some((e) => e.name === "interaction_submitted" && e.detail?.outcome === "solved") && !ev.some((e) => JSON.stringify(e.detail).includes("gate")), JSON.stringify(ev.slice(0, 3)));

await b.close?.();
summary();

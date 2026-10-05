// A real child plays the mission built through the no-code forms
// (forms-lifecycle.mjs): randomised pool, a changing-condition event, Mission
// Control audio, video with captions, layered pictures, a real checkpoint
// wait, interruption/resume of a typed answer, and related Trail entries —
// then the admin reads the run in the analytics insights.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";

const { slug: SLUG, id: MID } = JSON.parse(readFileSync("/tmp/wla-qa/forms-mission.json", "utf8"));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (p, init = {}) => (await fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));

const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: `QA Forms ${Date.now().toString(36).slice(-4)}`, birth_year: 2015 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: MID, source: "admin", status: "active" }) });

const b = await launch({ port: 9576 });
await b.viewport(1512, 950);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(700); };
const at = (re, t = 30000) => b.waitText(re, t);
await uiLogin(b, q.email, q.password);
await b.cookies([{ name: "wla_active_child", value: kid.id }]);
await b.goto(`/academy/missions/${SLUG}`, 1200);
await b.click(/^start mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000);
const active = `/academy/missions/${SLUG}/active`;
const progress = async () => (await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${MID}&select=id,current_screen_key,status`))[0];

console.log("\n--- randomised pool ---");
await at(/Your clue animal is/);
const clue = (await main()).match(/Your clue animal is (\w*)\./)?.[1];
const p0 = await progress();
const st0 = (await svc(`mission_state?progress_id=eq.${p0.id}&select=state_data`))[0].state_data;
chk("the pool drew one approved item, shown to the child and stored for the run", ["owl", "fox"].includes(clue) && st0.variables.clue === clue, `${clue} / ${st0.variables?.clue}`);
await b.goto(active, 1000);
chk("the draw is kept across a reload (seeded once)", (await main()).includes(`Your clue animal is ${clue}.`));
await b.click(/^continue$/i, { selector: "main button" }); await settle();

console.log("\n--- changing-condition event ---");
await at(/How many tracks did you find/);
await b.fill("main input", "2"); await b.click(/^enter$/i, { selector: "main button" }); await settle();
chk("the event fired and interrupted the route (count → storm, not → media)", await at(/A storm is coming/), (await main()).slice(0, 200));
const priv = (await svc(`mission_state_private?progress_id=eq.${p0.id}&select=data`))[0]?.data;
chk("the fired event is recorded privately on the server", JSON.stringify(priv).includes("storm"));

console.log("\n--- Mission Control audio ---");
await b.click(/^mission control$/i, { selector: "main button" }); await sleep(600);
const audio = await b.eval("(()=>{const a=document.querySelector('[role=dialog] audio'); return a? {src:a.src, label:a.getAttribute('aria-label'), controls:a.controls, autoplay:a.autoplay}: null})()");
chk("Mission Control offers the audio hint: signed, with controls, never autoplaying", audio && /\/sign\/mission-media\//.test(audio.src) && audio.controls && !audio.autoplay, JSON.stringify(audio));
const ar = audio ? await fetch(audio.src) : null;
chk("the audio file is served", ar?.ok && /audio|octet/.test(ar.headers.get("content-type") || ""), `${ar?.status} ${ar?.headers.get("content-type")}`);
await b.click(/^back to the mission$/i, { selector: "[role=dialog] button" }); await sleep(300);
chk("closing Mission Control returns to the same screen, unchanged", /A storm is coming/.test(await main()) && (await progress()).current_screen_key === "storm_news");
await b.click(/^continue$/i, { selector: "main button" }); await settle();

console.log("\n--- video, captions, layers ---");
await at(/What the river did/);
for (let i = 0; i < 20 && !(await b.eval("!!document.querySelector('main video')")); i++) await sleep(250);
const video = await b.eval("(()=>{const v=document.querySelector('main video'); const t=v?.querySelector('track'); return v? {src:v.src, controls:v.controls, autoplay:v.autoplay, track: t? {kind:t.kind, src:t.src, def:t.default}: null}: null})()");
chk("video: signed, controls, no autoplay", video && /\/sign\/mission-media\//.test(video.src) && video.controls && !video.autoplay, JSON.stringify(video).slice(0, 200));
chk("video carries a captions track", video?.track?.kind === "captions" && /\/sign\/mission-media\//.test(video.track.src) && video.track.def, JSON.stringify(video?.track));
const vtt = video?.track ? await (await fetch(video.track.src)).text() : "";
chk("the captions file is the authored WebVTT", /^WEBVTT/.test(vtt) && /river rises over the stones/.test(vtt), vtt.slice(0, 80));
chk("video has its transcript too", /Read the transcript/.test(await main()));
await b.click(/^read the transcript$/i, { selector: "main summary" }); await sleep(200);
chk("the transcript reads", /The river rises over the stones/.test(await main()));
const layers = async () => b.eval("[...document.querySelectorAll('main figure .relative img')].length");
const before = await layers();
await b.click(/After the flood/, { selector: "main label" }); await sleep(250);
const after = await layers();
chk("layers: the overlay is a named checkbox that shows and hides it", before === 2 && after === 1, `${before} → ${after}`);
await b.click(/^continue$/i, { selector: "main button" }); await settle();

console.log("\n--- checkpoint wait (a real interval) ---");
await b.goto(active, 1200);
await b.waitText(/isn.t ready yet|opens at|opens on|A day has passed/, 45000);
const waitText = await main();
chk("the next stage says it opens later, calmly, with the way back", /isn.t ready yet|opens at|opens on/.test(waitText) && /Back to Mission Home/.test(waitText), waitText.slice(0, 200));
chk("the server agrees: the child is held at the stage", (await progress()).current_screen_key === "later");
for (let i = 0; i < 40 && !/A day has passed/.test(await main()); i++) { await sleep(2000); await b.goto(active, 800); }
chk("after the interval the stage opens", /A day has passed/.test(await main()));
await b.click(/^continue$/i, { selector: "main button" }); await settle();

console.log("\n--- interruption / resume ---");
await at(/What is your plan\?/);
await b.fill("main textarea, main input:not([type=hidden])", "Cross at the stepping stones before the water rises.");
await sleep(300);
await b.goto(active, 1200); // the tab reloads mid-answer
await sleep(600);
chk("a half-written answer survives a reload", (await b.eval("document.querySelector('main textarea, main input:not([type=hidden])').value")) === "Cross at the stepping stones before the water rises.");
await b.click(/save and continue/i, { selector: "main button" }); await settle();
await at(/what is your plan now/i);
chk("the saved draft is gone once submitted", !(await b.eval("Object.keys(sessionStorage).some(k=>k.includes(':plan:'))")));
await b.fill("main textarea, main input:not([type=hidden])", "Use the high bridge, the stones are under water.");
await b.click(/save and continue/i, { selector: "main button" });
chk("the mission completes", await b.waitUrl(/\/complete/, 40000));

console.log("\n--- Trail relations ---");
await b.goto(`/academy/missions/${SLUG}/trail`, 1200);
const trail = await main();
chk("both plans are on the Trail, kept during the mission", /My first plan/.test(trail) && /My plan now/.test(trail) && (trail.match(/during the mission/g) || []).length >= 2);
chk("the new plan says what it changes, linking to the first", /Changes the plan in\s*My first plan/.test(trail));
const href = await b.eval("([...document.querySelectorAll('main a')].find(a=>a.innerText.trim()==='My first plan')||{}).getAttribute?.('href')");
chk("the link lands on the first plan's entry", Boolean(href) && (await b.eval(`!!document.getElementById(${JSON.stringify((href || "#").slice(1))})`)), String(href));

console.log("\n--- analytics insights on this real run ---");
const A = await launch({ port: 9577 }); await A.viewport(1512, 950);
await uiLogin(A, ...ACCOUNTS.admin);
await A.goto(`/admin/analytics/${SLUG}`, 1500);
const ins = await A.eval("document.querySelector('main').innerText");
chk("insights count the run: starts and completions", /Starts\s*\n?\s*[1-9]/.test(ins) && /Completions\s*\n?\s*[1-9]/.test(ins), ins.slice(0, 300).replace(/\n+/g, " | "));
chk("insights show the event and Mission Control use", /Events fired: storm [1-9]/.test(ins) && /storm_news\s+[1-9]/.test(ins), (ins.match(/Events fired[^\n]*/) || [""])[0]);
chk("insights count the Trail saves", /Trail saves: [2-9]/.test(ins), (ins.match(/Trail saves: \d+/) || [""])[0]);
chk("no child appears in the insights", !ins.includes(kid.display_name) && !ins.includes("stepping stones"));
await A.close?.(); await b.close?.();
summary();

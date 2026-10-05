// FINAL QA — Learner, on the mission builder-final.mjs made through the forms.
// A fresh child signs in with an access code on a phone; the parent follows on
// a laptop. Kit without progress; print; Mission Control; branching; hidden
// variant variable; pause/resume; cross-device continuity; code retry; QR
// unlock gating a screen; interruption of a typed answer; completion; Trail;
// My Missions status; a fresh sibling sees none of it.
import { launch, chk, summary, uiLogin, sleep, BASE } from "./cdp.mjs";
import { readFileSync } from "node:fs";

const { slug: SLUG, id: MID } = JSON.parse(readFileSync("/tmp/wla-qa/final-mission.json", "utf8"));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (p, init = {}) => (await fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const tag = Date.now().toString(36).slice(-4);
const mk = async (name) => (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: name, birth_year: 2016 }) }))[0];
const kid = await mk(`QA Final ${tag}`), sib = await mk(`QA Final Sib ${tag}`);
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: MID, source: "admin", status: "active" }) });
const progress = async (c = kid) => (await svc(`mission_progress?child_id=eq.${c.id}&mission_id=eq.${MID}&select=id,current_screen_key,status,mission_version`))[0];
const state = async (p) => (await svc(`mission_state?progress_id=eq.${p.id}&select=state_data`))[0]?.state_data;

const P = await launch({ port: 9590 }), C = await launch({ port: 9591 });
await P.viewport(1512, 950); await C.viewport(390, 844, true);
const txt = (b) => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async (b) => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(700); };
const active = `/academy/missions/${SLUG}/active`;

console.log("\n--- sign in by code ---");
await uiLogin(P, q.email, q.password);
await P.goto(`/account/children/${kid.id}`, 800);
await P.click(/^(create a code|make a new code)$/i, { selector: "button" });
await P.waitText(/new code\. Write it down/i, 30000);
const code = await P.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
await C.goto("/child/login", 400); for (let i = 0; i < 40 && !(await C.eval("!!document.querySelector('input[name=code]')")); i++) await sleep(500); await C.fill("input[name=code]", code); await C.click(/continue/i, { selector: "button[type=submit]" });
chk("child signs in with the access code", await C.waitUrl(/\/academy/, 40000));
const ccookie = async () => (await C.getCookies()).map((c) => `${c.name}=${c.value}`).join("; ");

console.log("\n--- My Missions, Mission Home, Kit ---");
await C.goto("/academy/my-missions", 1000);
const mm = await txt(C);
chk("My Missions lists the mission: Not Started → Start Mission", mm.includes(`QA FINAL`) && /Not started/i.test(mm) && /Start Mission/.test(mm), mm.slice(0, 300).replace(/\n+/g, " | "));
await C.goto(`/academy/missions/${SLUG}`, 1000);
const home = await txt(C);
const primary = await C.eval("(()=>{const a=[...document.querySelectorAll('main a, main button')].find(x=>/^Start Mission/i.test(x.innerText.trim())); return a? getComputedStyle(a).backgroundColor : null})()");
chk("Mission Home: Start Mission is the primary action; Kit is there; For Parents is withheld from a child session", Boolean(primary) && /Mission Kit/i.test(home) && !/For Parents/i.test(home), primary + " | " + home.slice(0, 400).replace(/\n+/g, " | "));
await C.goto(`/academy/missions/${SLUG}/kit`, 1000);
const kitLinks = await C.eval("[...document.querySelectorAll('main a')].map(a=>a.getAttribute('href')).filter(h=>/\\/api\\/kit\\//.test(h))");
const kr = kitLinks[0] ? await fetch(`${BASE}${kitLinks[0]}`, { redirect: "manual", headers: { cookie: await ccookie() } }) : null;
chk("Kit: the child opens the card base through a signed redirect", kr?.status === 302 && /\/object\/sign\/mission-resources\//.test(kr.headers.get("location") || ""), `${kr?.status}`);
await C.goto(`/academy/missions/${SLUG}/parents`, 800);
chk("opening the Kit and For Parents creates no progress", !(await progress()));
await C.goto(`/academy/missions/${SLUG}`, 800);
chk("Mission Home still says Start Mission", /Start Mission/.test(await txt(C)));

console.log("\n--- start, print, Mission Control ---");
await C.click(/^start mission/i, { selector: "main button, main a" }); await C.waitUrl(/\/active/, 40000);
await C.waitText(/The crossing/, 20000);
const p1 = await progress(), s1 = (await svc(`mission_state_private?progress_id=eq.${p1.id}&select=data`))[0]?.data;
const word = s1?.hidden?.code_word;
chk("a variant was drawn for this run and kept server-side, in private state", ["MAPLE", "CEDAR"].includes(word) && ["north", "south"].includes(s1?.variant) && !JSON.stringify(await state(p1)).includes(word), `${s1?.variant}/${word}`);
chk("run pinned to the published version (v2)", p1.mission_version === 2, String(p1.mission_version));
const html = await C.eval("document.documentElement.outerHTML");
chk("the hidden variable never reaches the browser", !html.includes("MAPLE") && !html.includes("CEDAR"));
const plink = await C.eval("([...document.querySelectorAll('main a')].find(a=>/Print: Your code card/.test(a.innerText))||{}).getAttribute?.('href')");
const pr = plink ? await fetch(`${BASE}${plink}`, { headers: { cookie: await ccookie() } }) : null;
chk("the printable is made for this run (PDF, not cached)", pr?.ok && /application\/pdf/.test(pr.headers.get("content-type") || "") && /no-store/.test(pr.headers.get("cache-control") || ""), `${plink} ${pr?.status}`);
await C.click(/^mission control$/i, { selector: "main button" }); await sleep(600);
chk("Mission Control opens with the authored support", /Where is the card\?/.test(await C.eval("(document.querySelector('[role=dialog]')||{}).innerText||''")));
await C.click(/^back to the mission$/i, { selector: "[role=dialog] button" }); await sleep(300);
chk("Mission Control did not advance the mission", (await progress()).current_screen_key === "intro" && /The crossing/.test(await txt(C)));
await C.click(/^continue$/i, { selector: "main button" }); await settle(C);

console.log("\n--- branch, pause/resume, cross-device ---");
await C.waitText(/Which way will you go/, 20000);
await C.click("The north road", { selector: "main button" }); await C.click(/^confirm/i, { selector: "main button" }); await settle(C);
chk("the decision takes its branch (north)", await C.waitText(/The road is dry and long/, 20000));
await C.goto("/academy/my-missions", 1000);
chk("My Missions: In Progress → Continue Mission", /In progress \(1\)/i.test(await txt(C)) && /Continue Mission/.test(await txt(C)));
await C.goto(`/academy/missions/${SLUG}`, 800);
await C.click(/^continue mission/i, { selector: "main button, main a" }); await C.waitUrl(/\/active/, 40000);
chk("resume lands on the same screen", await C.waitText(/The road is dry and long/, 20000));
await P.cookies([{ name: "wla_active_child", value: kid.id }]);
await P.goto(active, 1200);
chk("another device (the parent's laptop) shows the same place", await P.waitText(/The road is dry and long/, 20000));
await P.click(/^continue$/i, { selector: "main button" }); await settle(P);
await C.goto(active, 1200);
chk("the child's phone follows the server, not its own copy", await C.waitText(/What code is on your card/, 20000));

console.log("\n--- code entry: miss, retry, QR unlock, gate ---");
await C.fill("main input", "OAK"); await C.click(/^check$/i, { selector: "main button" }); await settle(C);
chk("a wrong code gets the authored message and stays", /doesn.t open the gate yet/.test(await txt(C)) && (await progress()).current_screen_key === "code");
await C.goto(`/q/${SLUG}/gate`, 1500);
chk("scanning the gate card returns the child to the mission", /\/active$/.test(await C.url()), await C.url());
chk("the unlock is recorded on the server", (await state(await progress()))?.unlocked?.includes("gate"));
await C.fill("main input", word.toLowerCase()); await C.click(/^check$/i, { selector: "main button" }); await settle(C);
chk("the run's own code opens the gate; the gated screen shows because the card was scanned", await C.waitText(/The gate swings open/, 20000));
await C.click(/^continue$/i, { selector: "main button" }); await settle(C);

console.log("\n--- typed answer survives interruption; completion ---");
await C.waitText(/Which way would you choose next time/, 20000);
const ans = "The river path, because it is shorter.";
await C.fill("main textarea, main input:not([type=hidden])", ans); await sleep(300);
await C.goto(active, 1200); await sleep(600);
chk("a half-written answer survives a reload", (await C.eval("document.querySelector('main textarea, main input:not([type=hidden])').value")) === ans);
await C.click(/save and continue/i, { selector: "main button" });
chk("the mission completes", await C.waitUrl(/\/complete/, 40000));
const done = await txt(C);
chk("completion is closure: a sentence and the way back, no score, badge or upsell", /You finished something/.test(done) && /Back to My Missions/.test(done) && !/score|badge|points|streak|buy|purchase|upgrade/i.test(done), done.slice(0, 200).replace(/\n+/g, " | "));
const pf = await progress();
chk("server: complete; route recorded", pf.status === "complete" && (await state(pf))?.outcomes?.code === "open", JSON.stringify(pf));
await C.goto(`/academy/missions/${SLUG}/trail`, 1000);
const trail = await txt(C);
chk("Trail holds the child's own answer, private", trail.includes("Next time") && trail.includes(ans) && /private|only you/i.test(trail), trail.slice(0, 300).replace(/\n+/g, " | "));
await C.goto("/academy/my-missions", 1000);
chk("My Missions: Complete → View Mission", /Complete \(1\)/i.test(await txt(C)) && /View Mission/.test(await txt(C)));
await C.goto(active, 1200);
chk("a completed mission does not reopen for replay", !/Which way will you go/.test(await txt(C)), await C.url());

console.log("\n--- a sibling sees none of it ---");
await P.cookies([{ name: "wla_active_child", value: sib.id }]);
await P.goto("/academy/my-missions", 1000);
chk("sibling's My Missions does not show this mission", !(await txt(P)).includes("QA FINAL"));
await P.goto(`/academy/missions/${SLUG}/trail`, 1000);
const st = await txt(P);
chk("sibling cannot see the Trail answer", !st.includes(ans));
await P.goto(active, 1200);
chk("sibling cannot open the run", !/What code|The road is dry|Which way would you/.test(await txt(P)) && !(await progress(sib)));

await P.close?.(); await C.close?.();
summary(); process.exit(0);

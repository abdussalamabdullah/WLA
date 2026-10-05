// FINAL QA — analytics on real disposable activity for the Builder-made
// mission. Earlier final runs (learner-final, kb-final) completed it twice by
// different branches, with code misses, a QR scan, a print, Mission Control
// use, a pause and a resume across devices. This run adds an ABANDONED run
// (drop-off at the code screen, two misses) and then reads the admin
// analytics page, checking counts and that no name or free text appears.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";

const { slug: SLUG, id: MID } = JSON.parse(readFileSync("/tmp/wla-qa/final-mission.json", "utf8"));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (p, init = {}) => (await fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: `QA Dropoff ${Date.now().toString(36).slice(-4)}`, birth_year: 2016 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: MID, source: "admin", status: "active" }) });
const main = (b) => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async (b) => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(800); };

const b = await launch({ port: 9606 });
await b.viewport(390, 844, true);
await uiLogin(b, q.email, q.password);
await b.cookies([{ name: "wla_active_child", value: kid.id }]);
await b.goto(`/academy/missions/${SLUG}`, 1000);
await b.click(/^start mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000);
await b.waitText(/The crossing/, 20000);
await b.click(/^continue$/i, { selector: "main button" }); await settle(b);
await b.waitText(/Which way will you go/, 20000);
await b.click("The north road", { selector: "main button" }); await b.click(/^confirm/i, { selector: "main button" }); await settle(b);
await b.waitText(/The road is dry/, 20000);
await b.click(/^continue$/i, { selector: "main button" }); await settle(b);
await b.waitText(/What code is on your card/, 20000);
for (const miss of ["PINE", "ELM"]) { await b.fill("main input", miss); await b.click(/^check$/i, { selector: "main button" }); await settle(b); }
await b.close?.(); // the child walks away here

// TEST SETUP (declared): a real return gap cannot be waited out in QA, so the
// abandoned run's last activity is moved 3 hours back with the service role.
// Nothing else about the run is touched.
const pr = (await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${MID}&select=id,last_activity_at`))[0];
await fetch(`${SB}/rest/v1/mission_progress?id=eq.${pr.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ last_activity_at: new Date(Date.now() - 3 * 3600e3).toISOString() }) });
const R = await launch({ port: 9608 });
await R.viewport(390, 844, true);
await R.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
await uiLogin(R, q.email, q.password);
await R.cookies([{ name: "wla_active_child", value: kid.id }]);
await R.goto(`/academy/missions/${SLUG}`, 1000);
await R.click(/^continue mission/i, { selector: "main button, main a" }); await R.waitUrl(/\/active/, 40000);
chk("after the gap the child resumes exactly at the code screen", await R.waitText(/What code is on your card/, 20000));
const word = (await svc(`mission_state_private?progress_id=eq.${pr.id}&select=data`))[0].data.hidden.code_word;
await R.fill("main input", word); await R.click(/^check$/i, { selector: "main button" }); await settle(R);
await R.waitText(/Which way would you choose next time/, 20000);
await R.fill("main textarea, main input:not([type=hidden])", "North again, it was dry."); await R.click(/save and continue/i, { selector: "main button" });
chk("the returning child finishes", await R.waitUrl(/\/complete/, 40000));
await R.close?.();

const A = await launch({ port: 9607 });
await A.viewport(1512, 950);
await uiLogin(A, ...ACCOUNTS.admin);
await A.goto(`/admin/analytics/${SLUG}`, 2500);
for (let i = 0; i < 40 && !/Starts/.test(await main(A)); i++) await sleep(500);
const t = await main(A);
console.log("\n----- analytics page -----\n" + t.slice(0, 3500) + "\n--------------------------");
const ev = await svc(`analytics_events?mission_id=eq.${MID}&select=name,detail&limit=1000`);
const names = {}; for (const e of ev) names[e.name] = (names[e.name] || 0) + 1;
console.log("event names:", JSON.stringify(names));
const kids = await svc(`child_profiles?select=display_name&parent_id=eq.${parent.id}`);
const leakedName = kids.map((k) => k.display_name).find((n) => t.includes(n));
chk("no child name appears on the analytics page", !leakedName, leakedName);
chk("no typed answer or attempted code appears on the page", !/because it is shorter|to stay dry|it was dry|OAK|PINE|ELM|MAPLE|CEDAR/.test(t));
const details = JSON.stringify(ev.map((e) => e.detail));
chk("no free text, code attempt or hidden value is stored in event detail", !/because|stay dry|was dry|OAK|PINE|ELM|MAPLE|CEDAR|QA /.test(details), details.slice(0, 300));
chk("starts ≥ 3 and completions ≥ 2 are counted", /Starts\s*\n?\s*([3-9]|\d\d)/.test(t) && /Completions\s*\n?\s*([2-9]|\d\d)/.test(t), (t.match(/Starts[\s\S]{0,80}/) || [""])[0].replace(/\n+/g, " | "));
chk("unfinished runs are shown by the screen they stopped at", /Where do children stop\?/.test(t) && /Where unfinished runs last arrived/.test(t));
chk("the return is counted: Came back later ≥ 1 and Finished after returning ≥ 1", /Came back later\s*\n?\s*[1-9]/.test(t) && /Finished after returning\s*\n?\s*[1-9]/.test(t), (t.match(/Came back later[\s\S]{0,90}/) || [""])[0].replace(/\n+/g, " | "));
chk("the phone session is reported as a device class, nothing more", /Devices:[^\n]*(mobile|phone)/i.test(t), (t.match(/Devices:[^\n]*/) || [""])[0]);
chk("code attempts are counted for the code screen", /Code attempts/.test(t) && /\ncode\s+\d+\s+\d+\s+[1-9]\d*/.test(t), (t.match(/\ncode\s+\d+\s+\d+\s+\d+/) || [""])[0]);
chk("events recorded: start, complete, qr_scanned, code_attempted, mission_control", ["mission_started", "mission_completed", "qr_scanned", "code_attempted"].every((n) => names[n] > 0) && Object.keys(names).some((n) => /mission_control/.test(n)), JSON.stringify(names));
await A.close?.(); summary(); process.exit(0);

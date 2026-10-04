// Mission Board end to end on staging (D-73): a child offers a Trail entry,
// the parent permits it, WLA moderates and publishes, a child who finished
// the mission sees it without a name, one who hasn't sees nothing, and the
// parent's withdrawal removes it at once.
import { launch, uiLogin, ACCOUNTS, sleep, chk, summary } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const P = await launch({ port: 9535 }), C = await launch({ port: 9536 }), A = await launch({ port: 9537 });
await P.viewport(1512, 950); await C.viewport(390, 844); await A.viewport(1512, 950);
const settle = async (b) => { for (let i = 0; i < 120; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(800); };
const main = (b) => b.eval("(document.querySelector('main')||document.body).innerText");

// Choosing a child = the ACTIVE-CHILD cookie, which carries no authority:
// every request re-checks that the child belongs to this parent.
const pickChild = async (child) => {
  await P.cookies([{ name: "wla_active_child", value: child.id }]);
  await P.goto("/academy/my-missions", 800);
};
// 0. a small QA mission whose answer is kept as a DIGITAL Trail entry
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (path, init = {}) => (await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init })).json();
const SLUG = "qa-board-mission", builder = `/admin/builder/${SLUG}/1`;
await uiLogin(A, ...ACCOUNTS.admin);
await A.goto("/admin/builder", 800);
if (!(await main(A)).includes("QA BOARD MISSION")) {
  if (await A.has(/new mission|create a mission|start a new mission/i)) await A.click(/new mission|create a mission|start a new mission/i);
  await A.fill("#title", "QA BOARD MISSION"); await A.fill("#slug", SLUG);
  const lab = await A.eval("document.querySelector('select[name=lab]').options[1]?.value || document.querySelector('select[name=lab]').options[0].value");
  await A.fill("select[name=lab]", lab); await A.fill("#min_age", "8"); await A.fill("#max_age", "12");
  await A.click(/create/i, { selector: "button[type=submit]" }); await A.waitUrl(new RegExp(builder), 40000);
}
await A.goto(builder, 1000);
if (!/This version is locked/.test(await main(A))) {
  for (const [key, type, title, config, seq] of [
    ["try", "response", "How did you start?", { prompt: "What did you try first?", next: "finish", trail: { key: "approach", title: "How I approached it", type: "digital", fromInput: true } }, 10],
    ["finish", "completion", "Mission complete", { message: "Done." }, 20],
  ]) {
    await A.goto(builder, 900);
    if (new RegExp(`\\b${key} ·`).test(await main(A))) continue;
    await A.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
    await A.fill("#screen_key", key); await A.fill("#sequence", String(seq)); await A.fill("#type", type); await sleep(250);
    await A.fill("#title", title); await A.fill("#configuration-json", JSON.stringify(config));
    await A.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle(A);
  }
  await A.goto(builder, 900);
  await A.eval("document.querySelector('#definition-json').closest('details').open = true");
  await A.fill("#definition-json", JSON.stringify({ completion: { ref: { visited: "try" }, op: "exists" } }));
  await A.click(/^save mission logic$/i, { selector: "button" }); await settle(A);
  const mid0 = (await svc(`missions?slug=eq.${SLUG}&select=id`))[0].id;
  if (!(await svc(`mission_resources?mission_id=eq.${mid0}&version=eq.1&select=id`)).length) {
    await A.goto(builder, 900);
    const KF = "form:has(input[name=can_view])";
    await A.click(/^add a resource$/i, { selector: "button" }); await sleep(300);
    await A.fill(`${KF} input[name=title]`, "Board kit"); await A.setFile(`${KF} input[name=file]`, "/tmp/wla-qa/code-card-base.pdf");
    await A.click(/^add resource$/i, { selector: "button[type=submit]" }); await settle(A);
  }
  await A.goto(builder, 900);
  await A.fill("#content", "A tiny QA mission."); await A.click(/^save parent note$/i, { selector: "button" }); await settle(A);
  await A.goto(builder, 900);
  if (await A.has(/^submit for review$/i, "button")) { await A.click(/^submit for review$/i, { selector: "button" }); await settle(A); await A.goto(builder, 900); }
  await A.click(/^publish$/i, { selector: "button" }); await settle(A); await A.goto(builder, 900);
}
chk("QA Board mission published (kept out of the catalogue)", /This version is locked/.test(await main(A)));
const mission = (await svc(`missions?slug=eq.${SLUG}&select=id,published`))[0];
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
// QA fixture hygiene: earlier interrupted runs may have left contributions from this QA parent's children.
const qaKids = (await svc(`child_profiles?select=id&parent_id=eq.${parent.id}`)).map((k) => k.id);
if (qaKids.length) await fetch(`${SB}/rest/v1/board_contributions?child_id=in.(${qaKids.join(",")})`, { method: "DELETE", headers: H });
const stamp = Date.now().toString(36).slice(-4);
const made = await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify([
  { parent_id: parent.id, display_name: `Robin${stamp}`, birth_year: 2015 }, { parent_id: parent.id, display_name: `Ash${stamp}`, birth_year: 2015 }]) });
const [kid, other] = made;
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify(made.map((k) => ({ child_id: k.id, mission_id: mission.id, source: "admin", status: "active" }))) });

await uiLogin(P, q.email, q.password);
// the parent plays it with Robin to the end — the answer becomes a digital Trail entry
await pickChild(kid);
await P.goto(`/academy/missions/${SLUG}`, 1000);
if (!(await P.has(/^(start|continue) mission/i, "main button, main a"))) console.log("HOME:", (await main(P)).slice(0, 300).replace(/\n+/g, " | "), "URL", await P.url());
await P.click(/^(start|continue) mission/i, { selector: "main button, main a" }); await P.waitUrl(/\/active/, 40000);
await P.waitText(/What did you try first/, 20000);
await P.fill("main textarea, main input:not([type=hidden])", `I'm ${kid.display_name}. I tried the stepping stones first, then went round (ref ${stamp}q). Email me at robin@example.com`);
await P.click(/save and continue|continue/i, { selector: "main button" }); await P.waitUrl(/\/complete/, 40000);
await P.goto(`/account/children/${kid.id}`, 800);
await P.click(/^(create a code|make a new code)$/i, { selector: "button" }); await P.waitText(/new code\. Write it down/i, 30000);
const code = await P.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
await C.clearCookies(); await C.goto("/child/login", 500); await C.fill("input[name=code]", code);
await C.click(/continue/i, { selector: "button[type=submit]" }); await C.waitUrl(/\/academy/, 40000);

// 1. the child offers an entry
await C.goto(`/academy/missions/${SLUG}/trail`, 1000);
const offerable = await C.eval("[...document.querySelectorAll('main li')].filter(li=>/Offer this to the Mission Board/.test(li.innerText)).length");
const physicalOfferable = await C.eval("[...document.querySelectorAll('main li')].filter(li=>/You keep this/.test(li.innerText) && /Offer this to the Mission Board/.test(li.innerText)).length");
chk("only digital entries with text can be offered (never physical)", offerable >= 1 && physicalOfferable === 0, `${offerable} offerable, ${physicalOfferable} physical`);
chk("the child is told a grown-up is asked first", /A grown-up will be asked first/.test(await main(C)));
const entryTitle = await C.eval("[...document.querySelectorAll('main li')].find(li=>/Offer this to the Mission Board/.test(li.innerText)).querySelector('h2').innerText");
await C.click(/^offer this to the mission board$/i, { selector: "main button" });
chk("the offer waits for a grown-up (shown in place)", await C.waitText(/waiting for a grown-up/, 30000));
await C.goto(`/academy/missions/${SLUG}/trail`, 1000);
chk("…and still after a reload", /waiting for a grown-up/.test(await main(C)));
await C.goto("/academy/mission-board", 800);
chk("nothing on the Board before permission and moderation", /When you finish a mission|Nothing/.test(await main(C)) || !(await main(C)).includes(entryTitle));

// 2. the parent sees exactly what would be shared, and permits it
await P.goto("/account", 1000);
let t = await main(P);
chk("the parent sees the offer, the child and the anonymised copy", /Waiting for your permission/.test(t) && t.includes(kid.display_name) && /the copy WLA would see/.test(t));
const copy = await P.eval(`[...document.querySelectorAll('#board-permissions ~ ul li, section[aria-labelledby=board-permissions] li')].map(li=>li.innerText).join(' ')`);
chk("anonymised before anyone sees it: the child's name and email are gone", !copy.includes(`I'm ${kid.display_name}`) && !copy.includes("robin@example.com") && /\[name\]/.test(copy) && /stepping stones/.test(copy), copy.slice(0, 200));
await P.click(/^allow wla to review it$/i, { selector: "main button" }); await settle(P);
await P.goto("/account", 1000);
chk("permitted: now with WLA for review", /With WLA for review/.test(await main(P)));

// 3. WLA moderates — without seeing the child
await uiLogin(A, ...ACCOUNTS.admin);
await A.goto("/admin/board", 1000);
t = await main(A);
chk("moderation shows the copy, the mission and dates — never the child", /Waiting for review \([1-9]/.test(t) && !t.includes(kid.display_name));
const ta = await A.eval(`[...document.querySelectorAll('main li textarea')].find(t=>t.value.includes(${JSON.stringify(`ref ${stamp}q`)})).id`);
await A.fill(`#${ta}`, `I compared what each name was linked to before deciding (${stamp}).`);
await A.eval(`(()=>{const li=document.getElementById(${JSON.stringify(ta)}).closest('li'); const c=li.querySelector('input[name=curated]'); if(!c.checked) c.click();
  const a=li.querySelector('input[name=approach]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(a,'Started from the links'); a.dispatchEvent(new Event('input',{bubbles:true}));
  [...li.querySelectorAll('button')].find(b=>/^Publish$/.test(b.innerText.trim())).click();})()`);
await settle(A);
await A.goto("/admin/board", 1000);
chk("published", /Published \([1-9]/.test(await main(A)));

// 4. a child who finished Six Names sees it — with no author, count or reply
await C.goto("/academy/mission-board", 1000);
t = await main(C);
chk("the child sees the approach on the Board", t.includes(`linked to before deciding (${stamp})`) && /One approach: Started from the links/.test(t), t.slice(0, 300));
chk("no names, likes, counts or replies on the Board", !t.includes(kid.display_name) && !/\blikes?\b|comment|reply|\d+ views/i.test(t));
chk("a clear way back to My Missions", await C.has(/My Missions/, "main a"));
for (const [w, h] of [[390, 844], [1512, 950]]) {
  await C.viewport(w, h); await sleep(250);
  const a = await C.audit();
  chk(`Board @${w}: one h1, no overflow, small targets or heading skips`, a.h1 === 1 && a.overflow <= 0 && !a.small.length && !a.skip.length, JSON.stringify({ h1: a.h1, o: a.overflow, s: a.small, k: a.skip }));
}
await C.goto(`/academy/missions/${SLUG}/trail`, 1000);
chk("the child's Trail shows it is on the Board, without their name", /On the Mission Board, without your name/.test(await main(C)), (await main(C)).slice(0, 400).replace(/\n+/g, " | "));

// 5. a child who has not finished it sees nothing (no spoilers)
await pickChild(other);
await P.goto("/academy/mission-board", 1000);
chk("a child who hasn't finished the mission sees none of it", !(await main(P)).includes(`(${stamp})`) && /When you finish a mission/.test(await main(P)));

// 6. withdrawal removes it at once
await P.goto("/account", 1000);
await P.click(/^take it off the board$/i, { selector: "main button" }); await settle(P);
await C.goto("/academy/mission-board", 1000);
chk("withdrawn: gone from the Board at once", !(await main(C)).includes(`(${stamp})`));
await A.goto("/admin/board", 1000);
chk("withdrawn: gone from moderation too", !(await A.eval("[...document.querySelectorAll('main textarea')].map(t=>t.value).join(' ')")).includes(`(${stamp})`));

// leave the account as found: turn the code off
await P.goto(`/account/children/${kid.id}`, 800);
await P.click(/^turn off this code$/i, { selector: "button" });
chk("QA code turned off again", await P.waitText(/No code yet/, 20000));
summary();

// FINAL QA — Builder, through the real UI only (no Advanced JSON):
// create → mission logic (variables, variants, QR, printable, completion) →
// screens (decision, convergence, code entry with outcomes + retry, gated
// content, Trail marker, Mission Control, print offer) → Kit → QR sheet →
// print checklist → preview (play, reset, branch) → QA → Review → Publish →
// new version → edit → publish (v1 archived) → rollback → duplicate.
// Writes /tmp/wla-qa/final-mission.json for learner-final.mjs.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { forms } from "./forms-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const stamp = Date.now().toString(36).slice(-5);
const SLUG = `qa-final-${stamp}`, TITLE = `QA FINAL ${stamp.toUpperCase()}`;
const builder = (v = 1) => `/admin/builder/${SLUG}/${v}`;
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const svc = async (p) => (await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
const ops = [];
const op = (name, ok, detail) => { chk(name, ok, detail); ops.push([name, ok]); };

const b = await launch({ port: 9585 });
await b.viewport(1512, 950);
const f = forms(b);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(800); };
const jsonOpen = () => b.eval("[...document.querySelectorAll('#configuration-json,#definition-json')].some(t=>t.closest('details')?.open)");
let jsonEverOpened = false;
const noteJson = async () => { if (await jsonOpen()) jsonEverOpened = true; };
await uiLogin(b, ...ACCOUNTS.admin);

// ------------------------------------------------------------------ create
await b.goto("/admin/builder", 800);
if (await b.has(/new mission|create a mission|start a new mission/i)) await b.click(/new mission|create a mission|start a new mission/i);
await b.fill("#title", TITLE); await b.fill("#slug", SLUG);
const lab = await b.eval("document.querySelector('select[name=lab]').options[1]?.value || document.querySelector('select[name=lab]').options[0].value");
await b.fill("select[name=lab]", lab); await b.fill("#min_age", "8"); await b.fill("#max_age", "12");
await b.click(/create/i, { selector: "button[type=submit]" });
op("create mission (UI)", await b.waitUrl(new RegExp(builder(1)), 40000));

// ------------------------------------------------------------- mission logic
await b.goto(builder(1), 1200);
await f.open("Variables");
await f.click({ summary: "Variables" }, "Add variable");
await f.set({ legend: "Variable 1" }, "Key", "code_word");
await f.set({ legend: "Variable 1" }, "Type", "string");
await f.set({ legend: "Variable 1" }, "Visibility", "hidden");
await f.open("Variants");
for (const [n, id, word] of [[1, "north", "MAPLE"], [2, "south", "CEDAR"]]) {
  await f.click({ summary: "Variants" }, "Add variant");
  await f.set({ legend: `Variant ${n}` }, "Id", id);
  await f.set({ legend: `Variant ${n}` }, "Label", id === "north" ? "North" : "South");
  await f.set({ legend: `Variant ${n}` }, "Values", JSON.stringify({ code_word: word }));
}
await f.open("QR codes");
await f.click({ summary: "QR codes" }, "Add qr");
await f.set({ legend: "Qr 1" }, "Key", "gate").catch(async () => f.set({ summary: "QR codes" }, "Key", "gate"));
await f.set({ summary: "QR codes" }, "Label", "The gate card");
await f.set({ summary: "QR codes" }, "Action", "unlock");
await f.set({ summary: "QR codes" }, "Unlock", "gate");
await f.open("Printables");
await f.click({ summary: "Printables" }, "Add print");
await f.set({ summary: "Printables" }, "Key", "card");
await f.set({ summary: "Printables" }, "Title", "Your code card");
await f.set({ summary: "Printables" }, "Base", "Card base");
await f.click({ summary: "Printables" }, "Add field");
await f.set({ summary: "Printables" }, "Text", "Code: {{var.code_word}}");
await f.set({ summary: "Printables" }, "X", "20"); await f.set({ summary: "Printables" }, "Y", "40");
await f.set({ summary: "Printables" }, "Font", "display");
await f.set({ summary: "Printables" }, "Max Width", "120");
await f.open("Completion condition");
await f.click({ summary: "Completion condition" }, "Add completion condition");
await f.set({ summary: "Completion condition" }, "Condition type", "When…");
await f.set({ summary: "Completion condition" }, "What", "response");
await f.set({ summary: "Completion condition" }, "Which", "wrap");
await f.set({ summary: "Completion condition" }, "Test", "exists");
await noteJson();
await b.click(/^save mission logic$/i, { selector: "button" }); await settle();
op("mission logic via forms: variable, variants, QR, printable, completion", /Mission logic saved\./.test(await main()), (await main()).match(/Not ready to save[^\n]*/)?.[0] ?? "");

// ---------------------------------------------------------------- screens
async function screen(key, seq, type, title, body, fill) {
  await b.goto(builder(1), 1000);
  await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
  await b.fill("#screen_key", key); await b.fill("#sequence", String(seq));
  await b.fill("#type", type); await sleep(300);
  await b.fill("#title", title ?? ""); await b.fill("#body", body ?? "");
  await fill({ legend: `${type.replace(/_/g, " ")} settings` });
  await noteJson();
  await b.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle();
  op(`screen "${key}" (${type}) via forms`, /Screen saved\./.test(await main()), (await main()).match(/(Not saved|couldn|must|invalid)[^\n]*/i)?.[0] ?? "");
}
const L = { legend: "Logic" };
const logic = () => f.open("Logic: routes");
await screen("intro", 10, "content", "The crossing", "Print your code card before you start.", async (S) => {
  await f.set(S, "Goes to", "decide");
  await logic();
  await f.click(L, "Add prints"); await f.click(L, "Add print");
  await f.set(L, "Print 1", "card");
  await f.click(L, "Add mission control support"); await f.click(L, "Add mission control support");
  await f.set({ legend: "Mission Control support 1" }, "Title", "Where is the card?");
  await f.set({ legend: "Mission Control support 1" }, "Body", "Look for the print link on this screen.");
});
await screen("decide", 20, "choice", "Which way?", null, async (S) => {
  await f.set(S, "Prompt", "Which way will you go?");
  await f.set({ legend: "Option 1" }, "Id", "north"); await f.set({ legend: "Option 1" }, "Label", "The north road"); await f.set({ legend: "Option 1" }, "Goes to", "north");
  await f.set({ legend: "Option 2" }, "Id", "river"); await f.set({ legend: "Option 2" }, "Label", "The river path"); await f.set({ legend: "Option 2" }, "Goes to", "river");
  await logic();
  await f.set(L, "Branches meet again at", "code");
});
await screen("north", 30, "content", "The north road", "The road is dry and long.", async (S) => { await f.set(S, "Goes to", "code"); });
await screen("river", 40, "content", "The river path", "The path is short and muddy.", async (S) => { await f.set(S, "Goes to", "code"); });
await screen("code", 50, "code_entry", "The gate lock", null, async (S) => {
  await f.set(S, "Prompt", "What code is on your card?");
  await f.set(S, "Goes to", "gate_open");
  await f.set({ legend: "Outcome 1" }, "Id", "open");
  await f.set({ legend: "Outcome 1" }, "Value 1", "MAPLE");
  await f.click({ legend: "Outcome 1" }, "Add value");
  await f.set({ legend: "Outcome 1" }, "Value 2", "CEDAR");
  await f.click({ legend: "Outcome 2" }, "Remove item 2").catch(() => {});
  await f.set(S, "Message", "That doesn't open the gate yet. Check your card.");
  await logic();
  await f.click(L, "Add retry");
  await f.set(L, "Allowed", true);
});
await screen("gate_open", 60, "content", "The gate swings open", "Behind it, the meadow.", async (S) => {
  await f.set(S, "Goes to", "wrap");
  await logic();
  await f.click(L, "Add shown only when");
  await f.set(L, "Condition type", "When…");
  await f.set(L, "What", "unlocked"); await f.set(L, "Which", "gate"); await f.set(L, "Test", "exists");
  await f.set(L, "Otherwise goes to", "wrap");
});
await screen("wrap", 70, "response", "Looking back", null, async (S) => {
  await f.set(S, "Prompt", "Which way would you choose next time, and why?");
  await f.set(S, "Goes to", "done");
  await logic();
  await f.click(L, "Add mission trail marker");
  const T = { legend: "Mission Trail marker" };
  await f.set(T, "Key", "next_time"); await f.set(T, "Title", "Next time"); await f.set(T, "Type", "digital");
  await f.set(T, "Save the child's own answer", true);
});
await screen("done", 80, "completion", "Mission complete", null, async (S) => { await f.set(S, "Message", "You crossed."); });
op("no Advanced JSON field was ever opened", !jsonEverOpened);

// -------------------------------------------------------------- Kit & note
await b.goto(builder(1), 1000);
const KF = "form:has(input[name=can_view])";
await b.click(/^add a resource$/i, { selector: "button" }); await sleep(300);
await b.fill(`${KF} input[name=title]`, "Card base"); await b.setFile(`${KF} input[name=file]`, "/tmp/wla-qa/code-card-base.pdf");
await b.click(/^add resource$/i, { selector: "button[type=submit]" }); await settle();
await b.goto(builder(1), 1000);
await b.fill("#content", "A short mission about choosing a route and using a printed code."); await b.click(/^save parent note$/i, { selector: "button" }); await settle();
op("Kit resource and parent note (UI)", /Parent note saved/.test(await main()) || /Card base/.test(await main()));

// --------------------------------------------------------------- QA panels
await b.goto(builder(1), 1500);
const qa = await main();
op("QA results: nothing blocks publishing", /Nothing is stopping this version being published/.test(qa), qa.match(/Must fix[\s\S]{0,400}/)?.[0]?.replace(/\n+/g, " | "));
op("branch test: every route reaches Complete", /Branch test: (\d+) of \1 routes reach Complete/.test(qa), qa.match(/Branch test[^\n]*/)?.[0]);
op("print checklist names the printable's base", /Card base[\s\S]{0,120}base of printable "Your code card"/.test(qa), qa.match(/Print checklist[\s\S]{0,300}/)?.[0]?.replace(/\n+/g, " | "));
op("flow map shows the branch meeting again (◆)", await b.eval("[...document.querySelectorAll('svg text')].some(t=>/◆/.test(t.textContent))"));
await b.goto(`${builder(1)}/qr`, 1200);
op("QR sheet renders the gate code", (await b.eval("document.querySelectorAll('main svg[role=img]').length")) === 1 && new RegExp(`/q/${SLUG}/gate`).test(await main()));

// ----------------------------------------------------------------- preview
await b.goto(`${builder(1)}/preview`, 1500);
await b.waitText(/The crossing/, 10000);
op("preview: the print offer is shown (not made in preview)", /Print: Your code card/.test(await main()));
await b.click(/^continue$/i, { selector: "main button" }); await sleep(500);
await b.click("The river path", { selector: "main button" }); await b.click(/^confirm/i, { selector: "main button" }); await sleep(600);
op("preview: a decision takes its own branch", /The path is short and muddy/.test(await main()));
await b.click(/^start again$/i, { selector: "button" }); await sleep(600);
op("preview: Start again resets to the first screen with fresh state", /The crossing/.test(await main()));

// ---------------------------------------------------- review and publish v1
await b.goto(builder(1), 1000);
if (await b.has(/^submit for review$/i, "button")) { await b.click(/^submit for review$/i, { selector: "button" }); await settle(); await b.goto(builder(1), 1000); }
op("Draft → Review", /in review/i.test(await main()));
await b.click(/^publish$/i, { selector: "button" }); await settle(); await b.goto(builder(1), 1000);
op("Review → Publish v1 (locked)", /This version is locked/.test(await main()));
const m = (await svc(`missions?slug=eq.${SLUG}&select=id,published`))[0];
op("kept out of the public catalogue", m.published === false);

// ------------------------------------------ new version, edit, publish v2
await b.goto(`/admin/missions/${SLUG}`, 1200);
await b.click(/^create new version$/i, { selector: "button" }); await settle();
let vs = [];
for (let i = 0; i < 60 && vs.length < 2; i++) { vs = await svc(`mission_versions?mission_id=eq.${m.id}&select=version,status&order=version`); if (vs.length < 2) await sleep(500); }
op("create new version (v2 draft)", vs[1]?.status === "draft", JSON.stringify(vs));
await b.goto(builder(2), 1500);
await b.eval(`(()=>{const li=[...document.querySelectorAll('ol li')].find(li=>/\\bintro ·/.test(li.innerText)); [...li.querySelectorAll('button')].find(x=>x.innerText.trim()==='Edit').click();})()`);
await sleep(500);
await b.fill("#title", "The crossing (v2)");
await b.click(/^save screen$/i, { selector: "button[type=submit]" }); await settle();
await b.goto(builder(2), 1200);
op("edit v2 through the form", /The crossing \(v2\)/.test(await main()));
if (await b.has(/^submit for review$/i, "button")) { await b.click(/^submit for review$/i, { selector: "button" }); await settle(); await b.goto(builder(2), 1000); }
await b.click(/^publish$/i, { selector: "button" }); await settle();
for (let i = 0; i < 40; i++) { vs = await svc(`mission_versions?mission_id=eq.${m.id}&select=version,status&order=version`); if (vs[1]?.status === "published") break; await sleep(500); }
op("publish v2; v1 is archived, not deleted", vs[0]?.status === "archived" && vs[1]?.status === "published", JSON.stringify(vs));

// -------------------------------------------- rollback from archived v1
await b.goto(`/admin/missions/${SLUG}`, 1200);
await b.eval(`(()=>{const tr=[...document.querySelectorAll('tr')].find(t=>/^v1/.test(t.innerText.trim())); [...tr.querySelectorAll('button')].find(x=>/Restore as new draft/.test(x.innerText)).click();})()`);
await settle();
for (let i = 0; i < 60 && vs.length < 3; i++) { vs = await svc(`mission_versions?mission_id=eq.${m.id}&select=version,status&order=version`); if (vs.length < 3) await sleep(500); }
const v3title = (await svc(`mission_screens?mission_id=eq.${m.id}&version=eq.3&screen_key=eq.intro&select=title`))[0]?.title;
op("rollback: v3 draft restored from archived v1 (v1's content, not v2's)", vs[2]?.status === "draft" && v3title === "The crossing", `${JSON.stringify(vs)} / ${v3title}`);

// --------------------------------------------------------------- duplicate
await b.click(/^duplicate this mission$/i, { selector: "button" }); await sleep(300);
await b.fill("input[name=slug][required]", `${SLUG}-copy`);
await b.click(/^duplicate$/i, { selector: "button[type=submit]" }); await settle();
let copy;
for (let i = 0; i < 90 && !copy; i++) { copy = (await svc(`missions?slug=eq.${SLUG}-copy&select=id,published`))[0]; if (!copy) await sleep(500); }
await sleep(2000);
await b.goto(`/admin/builder/${SLUG}-copy/1`, 1500);
const ct = await main();
op("duplicate: unpublished copy with screens, logic and Kit", copy?.published === false && /intro ·/.test(ct) && /code ·/.test(ct) && /Card base/.test(ct), JSON.stringify(copy));

writeFileSync("/tmp/wla-qa/final-mission.json", JSON.stringify({ slug: SLUG, id: m.id }));
console.log("\nOPERATIONS:\n" + ops.map(([n, ok]) => `${ok ? "✓" : "✗"} ${n}`).join("\n"));
await b.close?.();
summary(); process.exit(0);

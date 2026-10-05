// The Builder's NO-CODE path, end to end (Plan §12): a mission built entirely
// through the schema-driven forms, the condition builder and the mission-logic
// editor — never the Advanced JSON fields — then published, rolled back to a
// new draft, edited through the forms, and duplicated. Writes the mission's
// slug for forms-learner.mjs.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { forms } from "./forms-lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const stamp = Date.now().toString(36).slice(-5);
const SLUG = `qa-forms-${stamp}`, TITLE = `QA FORMS ${stamp.toUpperCase()}`;
const builder = (v = 1) => `/admin/builder/${SLUG}/${v}`;
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const svc = async (p) => (await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();

const b = await launch({ port: 9573 });
await b.viewport(1512, 950);
const f = forms(b);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(800); };
const jsonUsed = async () => b.eval("[...document.querySelectorAll('#configuration-json,#definition-json')].some(t=>t.closest('details')?.open)");

await uiLogin(b, ...ACCOUNTS.admin);

// ------------------------------------------------------------ media files
// A real WebM made by the browser itself, captions, pictures and audio.
await b.goto("/login", 300);
const webm = await b.eval(`(async()=>{ const c=document.createElement('canvas'); c.width=160;c.height=120; const x=c.getContext('2d'); const st=c.captureStream(10); const mr=new MediaRecorder(st,{mimeType:'video/webm'}); const ch=[]; mr.ondataavailable=e=>ch.push(e.data); mr.start(); for(let i=0;i<20;i++){x.fillStyle='hsl('+i*18+',45%,55%)';x.fillRect(0,0,160,120); await new Promise(r=>setTimeout(r,80));} mr.stop(); await new Promise(r=>mr.onstop=r); const buf=await new Blob(ch,{type:'video/webm'}).arrayBuffer(); let s=''; const u=new Uint8Array(buf); for(const b of u) s+=String.fromCharCode(b); return btoa(s); })()`);
writeFileSync("/tmp/wla-qa/river.webm", Buffer.from(webm, "base64"));
writeFileSync("/tmp/wla-qa/river.vtt", "WEBVTT\n\n00:00.000 --> 00:02.000\nThe river rises over the stones.\n");
for (const p of ["/tmp/wla-qa/bridge-before.png", "/tmp/wla-qa/bridge-after.png", "/tmp/wla-qa/tone.wav", "/tmp/wla-qa/code-card-base.pdf"]) {
  if (!existsSync(p)) throw new Error(`fixture missing: ${p} (run media.mjs / mechanics.mjs fixtures first)`);
}

console.log("\n--- A. Create the mission ---");
await b.goto("/admin/builder", 800);
if (await b.has(/new mission|create a mission|start a new mission/i)) await b.click(/new mission|create a mission|start a new mission/i);
await b.fill("#title", TITLE); await b.fill("#slug", SLUG);
const lab = await b.eval("document.querySelector('select[name=lab]').options[1]?.value || document.querySelector('select[name=lab]').options[0].value");
await b.fill("select[name=lab]", lab); await b.fill("#min_age", "8"); await b.fill("#max_age", "12");
await b.click(/create/i, { selector: "button[type=submit]" });
chk("a new mission's builder opens", await b.waitUrl(new RegExp(builder(1)), 40000));

console.log("\n--- B. Media through the Asset Manager ---");
const F = "section[aria-labelledby=media-assets] details form";
async function asset({ key, kind, file, alt, transcript, captions }) {
  await b.goto(builder(1), 1000);
  await b.eval(`document.querySelector(${JSON.stringify(F)}).closest('details').open = true`);
  await b.fill(`${F} input[name=key]`, key); await b.fill(`${F} select[name=kind]`, kind); await sleep(250);
  await b.setFile(`${F} input[name=file]`, file);
  if (alt) await b.fill(`${F} input[name=alt_text]`, alt);
  if (transcript) await b.fill(`${F} textarea[name=transcript]`, transcript);
  if (captions) await b.setFile(`${F} input[name=captions]`, captions);
  await b.eval(`document.querySelector(${JSON.stringify(F + " button[type=submit]")}).click()`);
  for (let i = 0; i < 160 && !/Media saved\.|couldn|isn.t used/.test(await main()); i++) await sleep(250);
  chk(`asset "${key}" (${kind}) saved`, /Media saved\./.test(await main()), (await main()).match(/Media[\s\S]{0,200}/)?.[0]);
}
await asset({ key: "bridge", kind: "image", file: "/tmp/wla-qa/bridge-before.png", alt: "The bridge before the flood." });
await asset({ key: "bridge_after", kind: "image", file: "/tmp/wla-qa/bridge-after.png", alt: "The bridge after the flood, the bank washed away." });
await asset({ key: "help_audio", kind: "audio", file: "/tmp/wla-qa/tone.wav", transcript: "Look at the second name again. What does it share with the first?" });
await asset({ key: "river_video", kind: "video", file: "/tmp/wla-qa/river.webm", transcript: "The river rises over the stones.", captions: "/tmp/wla-qa/river.vtt" });

console.log("\n--- C. Mission logic through the forms ---");
await b.goto(builder(1), 1000);
await f.open("Variables");
await f.click({ summary: "Variables" }, "Add variable");
await f.set({ legend: "Variable 1" }, "Key", "clues_found");
await f.set({ legend: "Variable 1" }, "Type", "counter");
await f.set({ legend: "Variable 1" }, "Visibility", "visible");
await f.click({ summary: "Variables" }, "Add variable");
await f.set({ legend: "Variable 2" }, "Key", "clue");
await f.set({ legend: "Variable 2" }, "Type", "string");
await f.set({ legend: "Variable 2" }, "Visibility", "visible");

await f.open("Controlled randomisation");
await f.click({ summary: "Controlled randomisation" }, "Add pool");
await f.set({ legend: "Pool 1" }, "Key", "clue_pool");
for (const [n, id] of [[1, "owl"], [2, "fox"]]) {
  await f.click({ legend: "Pool 1" }, "Add item");
  await f.set({ legend: `Item ${n}` }, "Id", id);
  await f.set({ legend: `Item ${n}` }, "Label", id === "owl" ? "The owl" : "The fox");
}
await f.set({ legend: "Pool 1" }, "Store the result in", "clue");

await f.open("Changing conditions");
await f.click({ summary: "Changing conditions" }, "Add event");
await f.set({ legend: "Event 1" }, "Key", "storm");
// the condition builder: when clues_found ≥ 1
await f.set({ legend: "Event 1" }, "Condition type", "When…");
await f.set({ legend: "Event 1" }, "What", "var");
await f.set({ legend: "Event 1" }, "Which", "clues_found");
await f.set({ legend: "Event 1" }, "Test", "gte");
await f.set({ legend: "Event 1" }, "Value", "1");
await f.set({ legend: "Event 1" }, "Goto", "storm_news");

await f.open("Checkpoints and stages");
await f.click({ summary: "Checkpoints and stages" }, "Add checkpoint");
await f.set({ legend: "Checkpoint 1" }, "Key", "day_two");
await f.set({ legend: "Checkpoint 1" }, "Screen Key", "later");
await f.set({ legend: "Checkpoint 1" }, "Label", "Day two");
await f.click({ legend: "Checkpoint 1" }, "Add opens after");
await f.set({ legend: "Checkpoint 1" }, "Since", "event:storm");
await f.set({ legend: "Checkpoint 1" }, "Seconds", "25");

await f.open("Completion condition");
await f.click({ summary: "Completion condition" }, "Add completion condition");
await f.set({ summary: "Completion condition" }, "Condition type", "When…");
await f.set({ summary: "Completion condition" }, "What", "response");
await f.set({ summary: "Completion condition" }, "Which", "revised");
await f.set({ summary: "Completion condition" }, "Test", "exists");
chk("mission logic built without the JSON fields", !(await jsonUsed()));
await b.click(/^save mission logic$/i, { selector: "button" }); await settle();
chk("mission logic saved from the forms", /Mission logic saved\./.test(await main()), (await main()).match(/Not ready to save[^\n]*/)?.[0] ?? "");
await b.goto(builder(1), 1000);
const def = JSON.parse(await b.eval("document.querySelector('#definition-json').value"));
chk("the saved definition is exactly what the forms said", def.variables?.length === 2 && def.pools?.[0]?.storeAs === "clue" && def.pools[0].items.length === 2
  && JSON.stringify(def.events?.[0]?.when) === JSON.stringify({ ref: { var: "clues_found" }, op: "gte", value: 1 }) && def.events[0].goto === "storm_news"
  && def.checkpoints?.[0]?.availableAfter?.seconds === 25 && def.completion?.ref?.response === "revised", JSON.stringify(def).slice(0, 400));

console.log("\n--- D. Screens through the forms ---");
async function screen(key, seq, type, title, body, fill) {
  await b.goto(builder(1), 1000);
  await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
  await b.fill("#screen_key", key); await b.fill("#sequence", String(seq));
  await b.fill("#type", type); await sleep(300);
  await b.fill("#title", title ?? ""); await b.fill("#body", body ?? "");
  const S = { legend: `${type.replace(/_/g, " ")} settings` };
  await fill(S);
  const used = await jsonUsed();
  await b.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle();
  chk(`screen "${key}" (${type}) added through the forms`, /Screen saved\./.test(await main()) && !used, (await main()).match(/(Not saved|couldn|must|invalid)[^\n]*/i)?.[0] ?? "");
}
const L = { legend: "Logic" };
const openLogic = () => f.open("Logic: routes");

await screen("intro", 10, "content", "The case", "Your clue animal is {{var.clue}}.", async (S) => {
  await f.set(S, "Goes to", "count");
});
await screen("count", 20, "numeric_entry", "Tracks", null, async (S) => {
  await f.set(S, "Prompt", "How many tracks did you find?");
  await f.set(S, "Label", "Tracks"); await f.set(S, "Min", "0"); await f.set(S, "Max", "20");
  await f.set(S, "Goes to", "media");
  await openLogic();
  await f.click(L, "Add changes to mission state");
  await f.click(L, "Add changes to mission state");
  // effects are a union: the kind select, then that kind's own fields (no legend of their own)
  await f.set(L, "Changes to mission state 1 — kind", "increment");
  await f.set(L, "Var", "clues_found");
});
await screen("storm_news", 30, "content", "A storm is coming", "The river is rising.", async (S) => {
  await f.set(S, "Goes to", "media");
  await openLogic();
  await f.click(L, "Add mission control support");
  await f.click(L, "Add mission control support");
  const M = { legend: "Mission Control support 1" };
  await f.set(M, "Title", "Listen");
  await f.set(M, "Body", "Hear a hint read aloud.");
  await f.click(M, "Add audio").catch(() => {});
  await f.set(M, "Audio", "asset:help_audio");
});
await screen("media", 40, "content", "What the river did", null, async (S) => {
  await f.set(S, "Goes to", "later");
  await openLogic();
  await f.click(L, "Add media");
  await f.click(L, "Add media");
  await f.set({ legend: "Media 1" }, "Asset", "river_video");
  await f.set({ legend: "Media 1" }, "Caption", "Filmed at the ford.");
  await f.click(L, "Add media");
  await f.set({ legend: "Media 2" }, "Asset", "bridge");
  await f.set({ legend: "Media 2" }, "Display", "layers");
  await f.click({ legend: "Media 2" }, "Add layers");
  await f.click({ legend: "Media 2" }, "Add layer");
  await f.set({ legend: "Layer 1" }, "Asset", "bridge_after");
  await f.set({ legend: "Layer 1" }, "Label", "After the flood");
});
await screen("later", 50, "content", "Day two", "A day has passed.", async (S) => { await f.set(S, "Goes to", "plan"); });
await screen("plan", 60, "response", "Your plan", null, async (S) => {
  await f.set(S, "Prompt", "What is your plan?"); await f.set(S, "Goes to", "revised");
  await openLogic();
  await f.click(L, "Add mission trail marker");
  const T = { legend: "Mission Trail marker" };
  await f.set(T, "Key", "first_plan"); await f.set(T, "Title", "My first plan"); await f.set(T, "Type", "digital");
  await f.set(T, "Save the child's own answer", true);
});
await screen("revised", 70, "response", "Your plan now", null, async (S) => {
  await f.set(S, "Prompt", "After the storm, what is your plan now?"); await f.set(S, "Goes to", "finish");
  await openLogic();
  await f.click(L, "Add mission trail marker");
  const T = { legend: "Mission Trail marker" };
  await f.set(T, "Key", "new_plan"); await f.set(T, "Title", "My plan now"); await f.set(T, "Type", "digital");
  await f.set(T, "Save the child's own answer", true);
  await f.click(T, "Add relates to earlier evidence");
  await f.set({ legend: "Relates To" }, "Key", "first_plan").catch(async () => f.set(T, "Key", "first_plan", 1));
  await f.set(T, "Relation", "changed_plan_of");
});
await screen("finish", 80, "completion", "Mission complete", null, async (S) => { await f.set(S, "Message", "You planned, then planned again."); });

console.log("\n--- E. Kit, note, QA, publish ---");
await b.goto(builder(1), 1000);
const KF = "form:has(input[name=can_view])";
await b.click(/^add a resource$/i, { selector: "button" }); await sleep(300);
await b.fill(`${KF} input[name=title]`, "River map"); await b.setFile(`${KF} input[name=file]`, "/tmp/wla-qa/code-card-base.pdf");
await b.click(/^add resource$/i, { selector: "button[type=submit]" }); await settle();
await b.goto(builder(1), 1000);
await b.fill("#content", "A mission about changing a plan when conditions change."); await b.click(/^save parent note$/i, { selector: "button" }); await settle();
await b.goto(builder(1), 1200);
const qa = await main();
chk("mission QA: nothing blocks publishing a form-built mission", /Nothing is stopping this version being published/.test(qa), qa.match(/Must fix[\s\S]{0,500}/)?.[0]?.replace(/\n+/g, " | "));
chk("branch testing reaches Complete", /Branch test: \d+ of \d+ routes reach Complete/.test(qa) && !/Branch test: 0 of/.test(qa), qa.match(/Branch test[^\n]*/)?.[0]);
chk("the flow map draws the event's interruption", /event: storm/.test(await b.eval("[...document.querySelectorAll('svg text')].map(t=>t.textContent).join('|')")));
if (await b.has(/^submit for review$/i, "button")) { await b.click(/^submit for review$/i, { selector: "button" }); await settle(); await b.goto(builder(1), 1000); }
await b.click(/^publish$/i, { selector: "button" }); await settle(); await b.goto(builder(1), 1000);
chk("published from the UI, and locked", /This version is locked/.test(await main()));
const m = (await svc(`missions?slug=eq.${SLUG}&select=id,published`))[0];
chk("kept out of the public catalogue", m.published === false);

console.log("\n--- F. Rollback: a new draft from version 1, edited through the forms ---");
await b.goto(`/admin/missions/${SLUG}`, 1000);
await b.click(/restore as new draft/i, { selector: "button" }); await settle();
let v = [];
for (let i = 0; i < 60 && v.length < 2; i++) { v = await svc(`mission_versions?mission_id=eq.${m.id}&select=version,status&order=version`); if (v.length < 2) await sleep(500); }
chk("rollback created a v2 draft from v1", v.length === 2 && v[1].status === "draft", JSON.stringify(v));
await b.goto(builder(2), 1200);
const v2 = await main();
chk("the v2 draft carries v1's screens, logic and media", /intro ·/.test(v2) && /revised ·/.test(v2) && /river_video · video/.test(v2));
await b.eval(`(()=>{const li=[...document.querySelectorAll('ol li')].find(li=>/\\bintro ·/.test(li.innerText)); [...li.querySelectorAll('button')].find(x=>x.innerText.trim()==='Edit').click();})()`);
await sleep(500);
await b.fill("#title", "The case (version 2)");
await b.click(/^save screen$/i, { selector: "button[type=submit]" }); await settle();
await b.goto(builder(2), 1000);
chk("v2 edited through the form; v1 unchanged for learners", /The case \(version 2\)/.test(await main()) && !/version 2/.test(JSON.stringify(await svc(`mission_screens?mission_id=eq.${m.id}&version=eq.1&screen_key=eq.intro&select=title`))));

console.log("\n--- G. Duplication ---");
await b.goto(`/admin/missions/${SLUG}`, 1000);
await b.click(/^duplicate this mission$/i, { selector: "button" }); await sleep(300);
await b.fill("input[name=slug][required]", `${SLUG}-copy`);
await b.click(/^duplicate$/i, { selector: "button[type=submit]" }); await settle();
let copy;
for (let i = 0; i < 90 && !copy; i++) { copy = (await svc(`missions?slug=eq.${SLUG}-copy&select=id,published`))[0]; if (!copy) await sleep(500); }
await sleep(2000); // the action copies storage files after the database copy
chk("the duplicate exists, unpublished", copy && copy.published === false, JSON.stringify(copy));
await b.goto(`/admin/builder/${SLUG}-copy/1`, 1500);
const ct = await main();
chk("the duplicate has the screens, logic and media", /intro ·/.test(ct) && /river_video · video/.test(ct) && /Text alternative: The bridge before/.test(ct));
const thumbs = await b.eval("[...document.querySelectorAll('section[aria-labelledby=media-assets] img')].map(i=>i.complete && i.naturalWidth>0)");
chk("the duplicate's media FILES were copied (pictures load)", thumbs.length >= 2 && thumbs.every(Boolean), JSON.stringify(thumbs));
const fileHref = await b.eval("([...document.querySelectorAll('a')].find(a=>/^Open file/.test(a.innerText))||{}).href||null");
const kitOk = fileHref ? (await fetch(fileHref)).ok : false;
chk("the duplicate's Kit file was copied", kitOk, String(fileHref));

writeFileSync("/tmp/wla-qa/forms-mission.json", JSON.stringify({ slug: SLUG, id: m.id }));
await b.close?.();
summary();

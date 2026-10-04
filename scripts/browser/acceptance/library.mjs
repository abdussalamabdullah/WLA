// Interaction library (D-86): build a mission with every library type in the
// Admin UI, then play it in Learner Preview at 390 / 834 / 1512, auditing each
// screen and driving each interaction the way a child would.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";

const SLUG = "qa-library-mission", TITLE = "QA LIBRARY MISSION";
const b = await launch({ port: 9450 });
await b.viewport(1512, 950);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 120; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(500); };
const builder = `/admin/builder/${SLUG}/1`;

const BRIDGE = "/missions/placeholder-bridge.svg";
const DEFINITION = {
  variables: [
    { key: "ramp_height", type: "number", visibility: "hidden", default: 1 },
    { key: "pack", type: "list", visibility: "visible", default: [] },
  ],
  workspaces: [{ key: "board", label: "Clue board", links: true,
    zones: [{ id: "sure", label: "Sure about" }, { id: "unsure", label: "Not sure yet" }],
    objects: [{ id: "note", label: "The torn note" }, { id: "print", label: "The footprint" }] }],
  completion: { ref: { visited: "ws_review" }, op: "exists" },
};
const S = [
  ["num", "numeric_entry", { prompt: "How many steps from the gate to the tree?", label: "Steps", unit: "steps", min: 0, max: 100,
    outcomes: [{ id: "close", match: { min: 10, max: 20 } }], onNoMatch: { mode: "retry", message: "Count again from the gate — that doesn't match yet.", fallbackAfter: 3, fallbackNext: "code" } }],
  ["code", "code_entry", { prompt: "What does the message say?", mode: "cipher", hint: "Use the cipher wheel from your Mission Kit.",
    outcomes: [{ id: "solved", match: { values: ["open the gate"] } }], onNoMatch: { mode: "retry", fallbackAfter: 5, fallbackNext: "tokens" } }],
  ["tokens", "token_sequence", { prompt: "Enter the symbols in the order you found them.", length: 3,
    tokens: [{ id: "sun", label: "Sun", symbol: "☀" }, { id: "moon", label: "Moon", symbol: "☾" }, { id: "star", label: "Star", symbol: "★" }],
    outcomes: [{ id: "found", match: { sequences: [["moon", "sun", "star"]] } }], onNoMatch: { mode: "retry", fallbackAfter: 4, fallbackNext: "seq" } }],
  ["seq", "arrange", { prompt: "Put the steps in the order you would do them.", mode: "sequence",
    items: [{ id: "plan", label: "Make a plan" }, { id: "test", label: "Test it" }, { id: "fix", label: "Fix what failed" }] }],
  ["sort", "arrange", { prompt: "Sort what you found.", mode: "sort", items: [{ id: "a", label: "A muddy boot" }, { id: "b", label: "A dry leaf" }],
    groups: [{ id: "inside", label: "Inside" }, { id: "outside", label: "Outside" }] }],
  ["match", "matching", { prompt: "Match each clue to the place it points to.", left: [{ id: "c1", label: "Where water rests" }, { id: "c2", label: "Where paths cross" }],
    right: [{ id: "pond", label: "The pond" }, { id: "gate", label: "The gate" }] }],
  ["alloc", "allocate", { prompt: "Share out 4 sandbags between the two walls.", mode: "allocation", total: 4, exact: true, totalLabel: "sandbags",
    controls: [{ id: "north", label: "North wall", min: 0, max: 4 }, { id: "south", label: "South wall", min: 0, max: 4 }] }],
  ["inv", "inventory", { prompt: "You can carry two things. What will you take?", max: 2, storeAs: "pack",
    items: [{ id: "rope", label: "Rope" }, { id: "torch", label: "Torch" }, { id: "map", label: "Map" }] }],
  ["cmp", "compare", { prompt: "Compare the two plans.", options: [{ id: "a", label: "Plan A" }, { id: "b", label: "Plan B" }],
    criteria: [{ id: "time", label: "Time it takes" }, { id: "risk", label: "What could go wrong" }],
    cells: { "a.time": "One afternoon", "a.risk": "Rain stops it", "b.time": "Two days", "b.risk": "Needs more help" }, pickPrompt: "Which plan will you follow?" }],
  ["matrix", "compare", { prompt: "Rate each plan.", mode: "matrix", scale: ["Weak", "OK", "Strong"], options: [{ id: "a", label: "Plan A" }, { id: "b", label: "Plan B" }],
    criteria: [{ id: "safe", label: "Safety" }] }],
  ["spot", "hotspot", { prompt: "Which part carries the most weight?", image: { src: BRIDGE, alt: "A bridge with a deck, two towers and cables." },
    regions: [{ id: "deck", label: "The deck", x: 5, y: 60, w: 90, h: 15 }, { id: "towers", label: "The towers", x: 20, y: 10, w: 15, h: 50 }] }],
  ["sketch", "sketch", { prompt: "Sketch your plan." }],
  ["route", "map", { prompt: "Plan a route from the camp to the lookout.", start: "camp", end: "lookout",
    nodes: [{ id: "camp", label: "Camp", x: 10, y: 80 }, { id: "stream", label: "Stream", x: 40, y: 60 }, { id: "wood", label: "Wood", x: 45, y: 25 }, { id: "lookout", label: "Lookout", x: 85, y: 20 }],
    edges: [["camp", "stream"], ["stream", "wood"], ["stream", "lookout"], ["wood", "lookout"]] }],
  ["net", "map", { prompt: "Connect the parts that depend on each other.", mode: "network",
    nodes: [{ id: "sun", label: "Sun", x: 20, y: 20 }, { id: "plant", label: "Plant", x: 50, y: 60 }, { id: "rabbit", label: "Rabbit", x: 80, y: 30 }] }],
  ["grid", "pattern_grid", { prompt: "Continue the pattern.", rows: 2, cols: 4, palette: [{ id: "a", label: "Circle", symbol: "●" }, { id: "b", label: "Square", symbol: "■" }], given: ["a", "b", "", "", "b", "a", "", ""] }],
  ["sim", "simulation", { prompt: "Set the ramp and let the ball go.",
    controls: [{ id: "height", label: "Ramp height", min: 1, max: 5, default: 1, ends: ["Low", "High"], storeAs: "ramp_height" }],
    readouts: [{ when: { ref: { var: "ramp_height" }, op: "gte", value: 4 }, text: "The ball flies past the target." }, { when: { always: true }, text: "The ball rolls, then slows." }] }],
  ["ws", "workspace", { prompt: "Place each clue where you think it belongs.", workspace: "board", requirePlaced: ["note"] }],
  ["ws_review", "workspace", { prompt: "Look at your board again.", workspace: "board", mode: "review" }],
];

async function addScreen(key, type, config, seq, next) {
  await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
  await b.fill("#screen_key", key); await b.fill("#sequence", String(seq));
  await b.fill("#type", type); await sleep(250);
  await b.fill("#title", ""); await b.fill("#body", "");
  await b.fill("#configuration-json", JSON.stringify(next ? { ...config, next } : config, null, 2));
  await b.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle();
  const t = await main();
  chk(`builder: add ${type} screen "${key}"`, /Screen saved\./.test(t), t.match(/(Not saved|error|invalid)[\s\S]{0,200}/i)?.[0]?.replace(/\n+/g, " | ") ?? "");
  if (await b.has(/^cancel$/i, "button")) { await b.click(/^cancel$/i, { selector: "button" }); await sleep(200); }
}

await uiLogin(b, ...ACCOUNTS.admin);
console.log("\n--- A. Build the library mission in the Admin UI ---");
await b.goto("/admin/builder", 600);
if (!(await main()).includes(TITLE)) {
  if (await b.has(/new mission|create a mission|start a new mission/i)) await b.click(/new mission|create a mission|start a new mission/i);
  await b.fill("#title", TITLE); await b.fill("#slug", SLUG);
  const lab = await b.eval("document.querySelector('select[name=lab]').options[1]?.value || document.querySelector('select[name=lab]').options[0].value");
  await b.fill("select[name=lab]", lab); await b.fill("#min_age", "8"); await b.fill("#max_age", "12");
  await b.click(/create/i, { selector: "button[type=submit]" });
  await b.waitUrl(new RegExp(builder), 40000);
}
await b.goto(builder, 800);
chk("a freshly created mission's builder loads (D-79)", (await b.h1s()).length === 1 && !/couldn.t load|something went wrong/i.test(await main()), (await main()).slice(0, 200));

// mission logic through the Advanced JSON fallback
await b.eval("document.querySelector('#definition-json').closest('details').open = true"); await sleep(150);
await b.fill("#definition-json", JSON.stringify(DEFINITION, null, 2)); await sleep(200);
await b.click(/^save mission logic$/i, { selector: "button" }); await settle();
chk("mission logic saved (variables, board, completion)", /Mission logic saved\./.test(await main()), (await main()).match(/Mission logic[\s\S]{0,300}/)?.[0]?.replace(/\n+/g, " | "));

await b.goto(builder, 800);
const existing = await main();
for (const [i, [key, type, config]] of S.entries()) {
  if (new RegExp(`\\b${key} ·`).test(existing)) continue;
  await addScreen(key, type, config, (i + 1) * 10, S[i + 1]?.[0] ?? "finish");
}
if (!/\bfinish ·/.test(existing)) await addScreen("finish", "completion", { message: "You worked through every kind of interaction." }, 999);
await b.goto(builder, 800);
const page = await main();
chk("the flow map draws the mission", await b.eval("!!document.querySelector('#flow-map') && document.querySelectorAll('svg[role=img] g').length > 10"));
const blockingQa = page.match(/(Must fix|blocking)[\s\S]{0,600}/i)?.[0] ?? "";
chk("mission QA raises no blocking problem with any library screen", !/unknown_answer|undeclared|unknown_workspace|broken|dead end|can.t reach|No path/i.test(blockingQa), blockingQa.replace(/\n+/g, " | ").slice(0, 400));

console.log("\n--- B. Play every screen in Learner Preview ---");
await b.goto(`${builder}/preview`, 1000);
const sizes = [[390, 844], [834, 1112], [1512, 950]];
async function auditHere(key) {
  for (const [w, h] of sizes) {
    await b.viewport(w, h); await sleep(250);
    const a = await b.audit();
    // Controls inside a closed <details> report empty innerText in Chrome; judge only what is showing.
    a.nameless = await b.eval("[...document.querySelectorAll('button,a[href],[role=button],[role=radio]')].filter(e=>!e.closest('details:not([open])') && e.getBoundingClientRect().width>0 && !(e.innerText||'').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && e.getAttribute('aria-hidden')!=='true').map(e=>e.tagName)");
    const ok = a.overflow <= 0 && a.small.length === 0 && a.unlabelled.length === 0 && a.nameless.length === 0 && a.skip.length === 0;
    chk(`${key} @${w}: no overflow, small targets, unlabelled or nameless controls, heading skips`, ok, JSON.stringify({ o: a.overflow, over: a.over, s: a.small, u: a.unlabelled, n: a.nameless, k: a.skip }));
    if (w === 390) await b.shot(`library-${key}-390`);
  }
}
const at = async (re) => b.waitText(re, 8000);
const btn = (re, nth = 0) => b.click(re, { selector: "main button", nth });
/** Click by accessible name (aria-label), where the visible text is a symbol. */
const hasNamed = (name) => b.eval(`[...document.querySelectorAll('main button')].some(x=>x.getAttribute('aria-label')===${JSON.stringify(name)})`);
const named = async (name) => {
  const ok = await b.eval(`(() => { const e=[...document.querySelectorAll('main button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(name)} && !x.disabled); if(!e) return false; e.click(); return true; })()`);
  if (!ok) throw new Error("no button named " + name);
  await sleep(250);
};

// numeric: a miss is a calm notice, not "didn't save"; a match advances
await at(/How many steps/); await auditHere("num");
await b.fill("main input", "5"); await btn(/^enter$/i); await sleep(300);
let t = await main();
chk("numeric: a miss shows guidance, keeps the input, and does not say 'didn't save'", /Count again from the gate/.test(t) && !/didn.t save/i.test(t) && (await b.eval("document.querySelector('main input').value")) === "5", t.slice(0, 300));
await b.fill("main input", "12"); await btn(/^enter$/i);
chk("numeric: a matching number moves on", await at(/What does the message say/));

await auditHere("code");
await b.fill("main input", "nope"); await btn(/^check$/i); await sleep(300);
chk("code: a miss is guidance", /doesn.t open anything yet/i.test(await main()));
await b.fill("main input", "OPEN the Gate!"); await btn(/^check$/i);
chk("code: the answer is matched however it is typed", await at(/symbols in the order/));

await auditHere("tokens");
for (const s of ["Moon", "Sun", "Star"]) await b.click(new RegExp(`${s}$`), { selector: "main button" });
chk("tokens: the sequence is read back in words", /Moon[\s\S]*Sun[\s\S]*Star/.test(await b.eval("document.querySelector('main ol').innerText")));
await btn(/^check$/i);
chk("tokens: the right sequence moves on", await at(/order you would do them/));

await auditHere("seq");
const before = await b.eval("[...document.querySelectorAll('main ol li')].map(l=>l.innerText.split('\\n')[1]).join('|')");
await named(await b.eval("[...document.querySelectorAll('main button[aria-label^=Move][aria-label$=down]')].find(x=>!x.disabled).getAttribute('aria-label')"));
const after = await b.eval("[...document.querySelectorAll('main ol li')].map(l=>l.innerText.split('\\n')[1]).join('|')");
chk("arrange: Move down reorders without dragging", before !== after, `${before} → ${after}`);
await btn(/^done$/i);
chk("arrange: an open-ended order is accepted", await at(/Sort what you found/));

await auditHere("sort");
chk("sort: Done waits until every item is placed", await b.eval("[...document.querySelectorAll('main button')].find(x=>/^Done$/.test(x.innerText.trim())).disabled"));
await b.click(/^inside$/i, { selector: "main [role=radio]", nth: 0 }); await b.click(/^outside$/i, { selector: "main [role=radio]", nth: 1 });
chk("sort: the chosen group is shown in words (✓), not colour alone", /✓/.test(await main()));
await btn(/^done$/i);
chk("sort: placed items move on", await at(/Match each clue/));

await auditHere("match");
const sel = await b.eval("[...document.querySelectorAll('main select')].map(s=>s.id)");
await b.fill(`#${sel[0]}`, "pond"); await sleep(100);
chk("matching: a used match is marked (used) for the others", await b.eval(`[...document.querySelector('#${sel[1]}').options].some(o=>/\\(used\\)/.test(o.text) && o.disabled)`));
await b.fill(`#${sel[1]}`, "gate"); await btn(/^done$/i);
chk("matching: complete pairs move on", await at(/Share out 4 sandbags/));

await auditHere("alloc");
chk("allocate: says what is left in words", /0 of 4 sandbags used — 4 left to place/.test(await main()), await main());
for (let i = 0; i < 3; i++) await named("More North wall");
await named("More South wall");
chk("allocate: +/− buttons work without the slider", /4 of 4 sandbags used/.test(await main()));
await btn(/^done$/i);
chk("allocate: an exact share moves on", await at(/carry two things/));

await auditHere("inv");
await b.click("Rope", { selector: "main button" }); await b.click("Torch", { selector: "main button" });
chk("inventory: capacity is enforced in the page too", await b.eval("[...document.querySelectorAll('main button')].find(x=>/^Map/.test(x.innerText.trim())).disabled") && /2 of 2 chosen/.test(await main()));
await btn(/^take these$/i);
chk("inventory: taking moves on", await at(/Compare the two plans/));

await auditHere("cmp");
chk("compare: content stacks by criterion (no wide table)", !(await b.eval("!!document.querySelector('main table')")));
await b.click("Plan A", { selector: "main fieldset button" }); await btn(/^continue$/i);
chk("compare: a pick moves on", await at(/Rate each plan/));

await auditHere("matrix");
await b.click(/^strong$/i, { selector: "main [role=radio]", nth: 0 }); await b.click(/^ok$/i, { selector: "main [role=radio]", nth: 1 });
await b.click("Plan B", { selector: "main fieldset button" }); await btn(/^continue$/i);
chk("matrix: rated and picked moves on", await at(/carries the most weight/));

await auditHere("spot");
chk("hotspot: the image has its text alternative", await b.eval("document.querySelector('main figure img').alt.length > 10"));
chk("hotspot: pointing targets are hidden from assistive tech (the named list is the control)", await b.eval("[...document.querySelectorAll('main figure button')].every(x=>x.getAttribute('aria-hidden')==='true' && x.tabIndex===-1)"));
await b.click("The deck", { selector: "main button:not([aria-hidden])" }); await btn(/^done$/i);
chk("hotspot: a choice moves on", await at(/Sketch your plan/));

await auditHere("sketch");
await b.eval(`(() => { const c=document.querySelector('main canvas'); const r=c.getBoundingClientRect();
  const ev=(t,x,y)=>c.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:1,clientX:r.left+x,clientY:r.top+y}));
  ev('pointerdown',10,10); ev('pointermove',60,40); ev('pointermove',120,90); ev('pointerup',120,90); })()`);
await sleep(200);
chk("sketch: a drawn line is counted for assistive tech", /1 line drawn/.test(await b.eval("document.querySelector('main canvas').getAttribute('aria-label')")));
await b.click(/^undo$/i, { selector: "main button" });
chk("sketch: undo removes it", /0 lines drawn/.test(await b.eval("document.querySelector('main canvas').getAttribute('aria-label')")));
await b.click(/drew it on paper/i, { selector: "main button" });
chk("sketch: paper is an equal way on", await at(/route from the camp/));

await auditHere("route");
chk("map: only connected places are offered next", (await b.eval("[...document.querySelectorAll('main button')].map(x=>x.innerText.trim())")).join("|").match(/Stream/) && !(await b.has(/^Wood$/, "main button")));
await b.click(/^stream$/i, { selector: "main button" }); await b.click(/^lookout$/i, { selector: "main button" });
chk("map: the route is read back in words", /Camp → Stream → Lookout/.test(await main()));
await btn(/^done$/i);
chk("map: a complete route moves on", await at(/depend on each other/));

await auditHere("net");
await b.click(/^sun$/i, { selector: "main button" }); await b.click(/^plant$/i, { selector: "main button" });
chk("network: the link is listed with a way to remove it", /Sun — Plant/.test(await main()) && (await hasNamed("Remove link Sun to Plant")));
await btn(/^done$/i);
chk("network: links move on", await at(/Continue the pattern/));

await auditHere("grid");
chk("grid: fixed squares are announced and cannot change", await b.eval("[...document.querySelectorAll('main [aria-label*=fixed]')].every(x=>x.disabled)"));
await named("Row 1, column 3: empty");
chk("grid: a placed piece is announced by name", await hasNamed("Row 1, column 3: Circle"));
await btn(/^check$/i);
chk("grid: an open-ended pattern moves on", await at(/Set the ramp/));

await auditHere("sim");
chk("simulation: Continue waits for a run", await b.eval("[...document.querySelectorAll('main button')].find(x=>/^Continue$/.test(x.innerText.trim())).disabled"));
for (let i = 0; i < 4; i++) await named("More Ramp height");
await b.click(/^run it$/i, { selector: "main button" }); await sleep(400);
t = await main();
chk("simulation: the readout the server chose is shown, the rule behind it is not", /Run 1/.test(t) && /flies past the target/.test(t) && !/ramp_height|gte/.test(await b.eval("document.querySelector('main').innerHTML")), t.slice(0, 400));
await btn(/^continue$/i);
chk("simulation: continue after a run", await at(/Place each clue/));

await auditHere("ws");
chk("workspace: Save waits for the piece this step needs", await b.eval("[...document.querySelectorAll('main button')].find(x=>/^Save the board$/.test(x.innerText.trim())).disabled") && /needed for this step/.test(await main()));
await b.click(/^sure about$/i, { selector: "main [role=radio]", nth: 0 });
await b.fill(`main select:nth-of-type(1)`, "note").catch(() => {});
const selects = await b.eval("[...document.querySelectorAll('main select')].length");
if (selects >= 2) {
  await b.eval(`(() => { const s=[...document.querySelectorAll('main select')]; const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('change',{bubbles:true}));}; set(s[0],'note'); set(s[1],'print'); })()`);
  await sleep(150); await b.click(/^connect$/i, { selector: "main button" });
}
chk("workspace: the placed piece appears in its zone", await b.eval("[...document.querySelectorAll('main section')].some(s=>/Sure about/.test(s.innerText) && /The torn note/.test(s.innerText))"));
await b.click(/^save the board$/i, { selector: "main button" });
chk("workspace: saving moves on", await at(/Look at your board again/));

await auditHere("ws_review");
t = await main();
chk("workspace: the board persists to a later screen (review)", /Sure about[\s\S]*The torn note/.test(t) && /The torn note — The footprint/.test(t), t.slice(0, 500));
await btn(/^continue$/i);
chk("the library mission completes", await at(/Mission complete/));

await b.close?.();
summary();

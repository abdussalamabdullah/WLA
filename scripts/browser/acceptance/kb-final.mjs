// FINAL QA — accessibility through the real UI: a fresh child plays the
// Builder-made mission with the KEYBOARD ONLY (Tab, Shift+Tab, Enter, Space,
// Escape, typing), with reduced motion requested, on a phone in portrait and
// landscape. Checks visible focus, focus return from Mission Control, how
// errors are announced, and the condition's "otherwise" route (no QR scan).
import { launch, chk, summary, uiLogin, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";

const { slug: SLUG, id: MID } = JSON.parse(readFileSync("/tmp/wla-qa/final-mission.json", "utf8"));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (p, init = {}) => (await fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: `QA Keys ${Date.now().toString(36).slice(-4)}`, birth_year: 2016 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: MID, source: "admin", status: "active" }) });

const b = await launch({ port: 9599 });
await b.viewport(390, 844, true);
await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
const KEYS = { Tab: 9, Enter: 13, " ": 32, Escape: 27 };
async function key(k, shift = false) {
  const p = { key: k, code: k === " " ? "Space" : k, windowsVirtualKeyCode: KEYS[k], modifiers: shift ? 8 : 0 };
  await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...p });
  if (k === "Enter" || k === " ") await b.send("Input.dispatchKeyEvent", { type: "char", text: k === "Enter" ? "\r" : " ", ...p });
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", ...p });
  await sleep(60);
}
const typeText = async (t) => { await b.send("Input.insertText", { text: t }); await sleep(100); };
const focused = () => b.eval(`(()=>{const e=document.activeElement; if(!e||e===document.body) return null; const s=getComputedStyle(e);
  return { text:(e.innerText||e.getAttribute('aria-label')||e.labels?.[0]?.innerText||e.value||e.name||e.tagName).trim().replace(/\\s+/g,' ').slice(0,40), tag:e.tagName, vis:(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0)||s.boxShadow!=='none' }; })()`);
const unseen = [];
// Tab (forwards) until the focused element matches; every stop must show focus.
async function tabTo(re, max = 40) {
  for (let i = 0; i < max; i++) {
    await key("Tab");
    const f = await focused();
    if (f && !f.vis) unseen.push(f.text);
    if (f && (re.test(f.text) || re.test(`<${f.tag}>`))) return f;
  }
  throw new Error(`tabTo ${re}: not reached; at ${JSON.stringify(await focused())}`);
}
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(800); };
const fromTop = () => b.eval("document.activeElement?.blur(); window.scrollTo(0,0)");

await uiLogin(b, q.email, q.password);
await b.cookies([{ name: "wla_active_child", value: kid.id }]);
await b.goto(`/academy/missions/${SLUG}`, 1200);
const rm = await b.eval("({mq: matchMedia('(prefers-reduced-motion: reduce)').matches, d: getComputedStyle(document.documentElement).getPropertyValue('--duration-base').trim(), maxT: Math.max(0,...[...document.querySelectorAll('body *')].map(e=>parseFloat(getComputedStyle(e).transitionDuration)||0))})");
chk("reduced motion: requested, and no element animates", rm.mq && /^0(ms|s)?$/.test(rm.d) && rm.maxT === 0, JSON.stringify(rm));
await fromTop(); await tabTo(/^Start Mission/); await key("Enter");
chk("keyboard: Start Mission", await b.waitUrl(/\/active/, 40000));
await b.waitText(/The crossing/, 20000);

for (const [w, h, label] of [[390, 844, "portrait"], [844, 390, "landscape"]]) {
  await b.viewport(w, h, true); await sleep(300);
  const a = await b.audit();
  chk(`Active Mission ${label} ${w}×${h}: no horizontal scroll, targets, names, labels`, a.overflow <= 0 && !a.small.length && !a.nameless.length && !a.unlabelled.length && a.h1 === 1, JSON.stringify(a));
}
await b.viewport(390, 844, true); await sleep(300);

await fromTop(); const mc = await tabTo(/^Mission Control$/); await key("Enter"); await sleep(500);
const inDialog = await b.eval("!!document.activeElement?.closest('[role=dialog]')");
chk("keyboard: Mission Control opens and takes focus", inDialog && /Where is the card\?/.test(await b.eval("(document.querySelector('[role=dialog]')||{}).innerText||''")));
await key("Escape"); await sleep(400);
const back = await focused();
chk("Escape closes Mission Control and returns focus to its button", !(await b.eval("!!document.querySelector('[role=dialog]')")) && back?.text === mc.text, JSON.stringify(back));
await fromTop(); await tabTo(/^Continue$/); await key("Enter"); await settle();

await b.waitText(/Which way will you go/, 20000);
const afterNav = await focused();
console.log("  focus after a screen change:", JSON.stringify(afterNav));
await fromTop(); await tabTo(/The river path/); await key(" "); await sleep(200);
await tabTo(/^Confirm/); await key("Enter"); await settle();
chk("keyboard: a decision is chosen and confirmed", await b.waitText(/The path is short and muddy/, 20000));
await fromTop(); await tabTo(/^Continue$/); await key("Enter"); await settle();

await b.waitText(/What code is on your card/, 20000);
await fromTop(); await tabTo(/^<INPUT>$/); await typeText("OAK");
await tabTo(/^Check$/); await key("Enter"); await settle();
const err = await b.eval(`(()=>{const m=[...document.querySelectorAll('main *')].filter(e=>/doesn.t open the gate yet/.test(e.textContent)).pop(); if(!m) return null;
  const live=m.closest('[role=alert],[role=status],[aria-live]'); const inp=document.querySelector('main input');
  const desc=(inp?.getAttribute('aria-describedby')||'').split(' ').map(id=>document.getElementById(id)).filter(Boolean);
  return { live: live? (live.getAttribute('role')||live.getAttribute('aria-live')) : null, linked: desc.some(d=>d.contains(m)||m.contains(d)), invalid: inp?.getAttribute('aria-invalid') }; })()`);
chk("a wrong code is announced (alert or live region) in words, not colour", Boolean(err?.live), JSON.stringify(err));
console.log("  code error wiring:", JSON.stringify(err), "| main:", (await main()).slice(0, 300).replace(/\n+/g, " | "), "| input:", await b.eval("document.querySelector('main input')?.value"));
const word = (await svc(`mission_state_private?progress_id=eq.${(await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${MID}&select=id`))[0].id}&select=data`))[0].data.hidden.code_word;
await fromTop(); await tabTo(/^<INPUT>$/);
await b.eval("document.activeElement.select?.()"); await typeText(word);
await tabTo(/^Check$/); await key("Enter"); await settle();
chk("without the QR scan the gated screen is skipped (the 'otherwise' route)", await b.waitText(/Which way would you choose next time/, 20000) && !/The gate swings open/.test(await main()));

const save = await b.eval("(()=>{const x=[...document.querySelectorAll('main button')].find(x=>/save and continue/i.test(x.innerText)); return x? {disabled:x.disabled, describedby: x.getAttribute('aria-describedby')}: null})()");
console.log("  empty answer: save button", JSON.stringify(save));
chk("an empty answer cannot be submitted (Save is disabled until there is text)", save?.disabled === true);
await fromTop(); await tabTo(/^<(TEXTAREA|INPUT)>$/); await typeText("The north road, to stay dry.");
await tabTo(/save and continue/i); await key("Enter");
chk("keyboard only: the mission completes", await b.waitUrl(/\/complete/, 40000));
await fromTop(); const home = await tabTo(/Back to My Missions/); await key("Enter");
chk("keyboard: back to My Missions from completion", await b.waitUrl(/\/my-missions/, 30000), JSON.stringify(home));
chk("every keyboard stop showed a visible focus indicator", unseen.length === 0, JSON.stringify(unseen.slice(0, 8)));
await b.close?.(); summary(); process.exit(0);

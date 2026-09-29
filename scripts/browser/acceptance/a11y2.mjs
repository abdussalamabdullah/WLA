import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const WHO = process.env.WHO;
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const b = await launch({ port: 9480 + Math.floor(Math.random() * 20) });
await b.viewport(1512, 950);
let PAGES;
if (WHO === "parent") {
  await uiLogin(b, ...ACCOUNTS.parent);
  await b.goto("/academy/my-missions", 500);
  if (/Whose missions/.test(await b.text())) { await b.click(/Bilal/, { selector: "main button" }); await b.waitText(/Hi Bilal/, 60000); }
  PAGES = ["/academy/my-missions", "/academy/missions/six-names", "/academy/missions/six-names/kit", "/academy/missions/six-names/trail", "/academy/missions/six-names/active", "/academy/mission-board", "/academy/help", "/account", "/account/children"];
}
if (WHO === "child") {
  const kid = kids.find((k) => k.display_name === "QA Stop Share");
  await uiLogin(b, q.email, q.password);
  await b.goto(`/account/children/${kid.id}`, 600);
  PAGES = [`/account/children/${kid.id}`];
  await b.click(/^(create a code|make a new code)$/i, { selector: "button" }); await b.waitText(/new code\. Write it down/i, 30000);
  const code = await b.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
  // audit the parent's child page (code panel) before switching to the child
  for (const [w, h, mob] of [[390, 844, true], [834, 1112, false], [1512, 950, false]]) {
    await b.viewport(w, h, mob); const a = await b.audit();
    chk(`${w} child profile page (code panel): overflow/h1/labels/targets`, a.overflow <= 0 && a.h1 === 1 && a.unlabelled.length === 0 && a.small.length === 0 && a.nameless.length === 0, JSON.stringify(a));
  }
  await b.viewport(1512, 950);
  await b.clearCookies(); await b.goto("/child/login", 300);
  await b.fill("input[name=code]", code); await b.click(/continue/i, { selector: "button[type=submit]" }); await b.waitUrl(/\/academy/, 40000);
  PAGES = ["/academy/my-missions", "/academy/missions/six-names", "/academy/missions/six-names/kit", "/academy/missions/six-names/trail", "/academy/missions/six-names/complete", "/academy/help"];
}
if (WHO === "admin") {
  await uiLogin(b, ...ACCOUNTS.admin);
  PAGES = ["/admin", "/admin/missions", "/admin/missions/six-names", "/admin/builder", "/admin/builder/six-names/2", "/admin/parents", "/admin/children", "/admin/orders", "/admin/activity", "/admin/analytics", "/admin/settings", "/admin/help"];
}
for (const [w, h, mob] of [[390, 844, true], [834, 1112, false], [1512, 950, false]]) {
  await b.viewport(w, h, mob);
  for (const p of PAGES) {
    await b.goto(p, 400);
    const a = await b.audit();
    const tag = `${String(w).padStart(4)} ${p}`;
    const probs = [];
    if (a.overflow > 0) probs.push(`overflow ${a.overflow}px ${a.over.join(",")}`);
    if (a.h1 !== 1) probs.push(`h1=${a.h1}`);
    if (a.skip.length) probs.push(`skip ${a.skip}`);
    if (a.unlabelled.length) probs.push(`unlabelled ${a.unlabelled}`);
    if (a.nameless.length) probs.push(`nameless ${a.nameless}`);
    if (a.small.length) probs.push(`small ${a.small.join(" ; ")}`);
    if (w === 1512) { const f = await b.focusAudit(18); const inv = f.filter((x) => !x.vis).map((x) => x.el); if (!f.length || inv.length) probs.push(`focus invisible: ${inv.join(" ; ")}`); }
    chk(`${tag}`, probs.length === 0, probs.join(" | "));
    if (w === 390) await b.shot(`${WHO}-${p.replace(/\W+/g, "_")}-390`);
  }
}
// dialogs
if (WHO === "parent") {
  await b.viewport(390, 844, true); await b.goto("/academy/my-missions", 500);
  const trig = await b.eval("(()=>{const x=[...document.querySelectorAll('button')].find(x=>/Missions/.test(x.innerText)&&x.getAttribute('aria-haspopup')); if(!x) return null; x.focus(); x.click(); return x.innerText.trim();})()");
  await sleep(700);
  const d = await b.eval("(()=>{const d=document.querySelector('[role=dialog]'); if(!d) return null; const lbl=d.getAttribute('aria-labelledby'); return {labelled: !!(lbl && document.getElementById(lbl)?.innerText), focusInside: d.contains(document.activeElement), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};})()");
  chk("child switcher dialog: labelled, focus moves inside, no overflow at 390", d && d.labelled && d.focusInside && d.overflow <= 0, JSON.stringify({ trig, d }));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(400);
  const back = await b.eval("({open: !!document.querySelector('[role=dialog]'), focusBack: /Missions/.test(document.activeElement?.innerText||'')})");
  chk("child switcher closes on Escape and returns focus to its trigger", !back.open && back.focusBack, JSON.stringify(back));
}
await b.close();
process.exit(summary() ? 1 : 0);

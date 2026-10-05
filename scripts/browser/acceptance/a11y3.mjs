// Final accessibility and responsive pass over the surfaces this build added
// (Plan §11): phone 390, tablet portrait 834, tablet LANDSCAPE 1180×820,
// desktop 1512. One h1, no horizontal overflow, no heading skips, every
// control labelled and named, 44px targets, visible focus (desktop).
import { launch, chk, summary, uiLogin, ACCOUNTS } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const WHO = process.env.WHO ?? "parent";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const b = await launch({ port: 9560 + (WHO === "admin" ? 1 : 0) });
await b.viewport(1512, 950);
let PAGES = [];
if (WHO === "parent") {
  await uiLogin(b, q.email, q.password);
  const six = kids.find((k) => k.display_name === "QA Ask Pause");
  await b.cookies([{ name: "wla_active_child", value: six.id }]);
  PAGES = ["/academy/my-missions", "/academy/missions/six-names", "/academy/missions/six-names/kit", "/academy/missions/six-names/trail", "/academy/mission-board", "/account"];
}
if (WHO === "admin") {
  await uiLogin(b, ...ACCOUNTS.admin);
  PAGES = ["/admin/board", "/admin/builder/qa-patterns-mission/1", "/admin/builder/qa-patterns-mission/1/preview", "/admin/builder/qa-mechanics-mission/1", "/admin/analytics/qa-mechanics-mission", "/admin/missions/qa-patterns-mission", "/admin/analytics"];
}
const SIZES = [[390, 844, true], [834, 1112, false], [1180, 820, false], [1512, 950, false]];
for (const [w, h, mob] of SIZES) {
  await b.viewport(w, h, mob);
  for (const p of PAGES) {
    await b.goto(p, 500);
    const a = await b.audit();
    // Chrome reports empty text for controls inside a closed <details>; judge what is showing.
    a.nameless = await b.eval("[...document.querySelectorAll('button,a[href],[role=button],[role=radio]')].filter(e=>!e.closest('details:not([open])') && e.getBoundingClientRect().width>0 && !(e.innerText||'').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title && e.getAttribute('aria-hidden')!=='true' && !e.querySelector('svg[aria-label],img[alt]:not([alt=\"\"])')).map(e=>e.tagName+':'+(e.getAttribute('href')||''))");
    const probs = [];
    if (a.overflow > 0) probs.push(`overflow ${a.overflow}px ${a.over.join(",")}`);
    if (a.h1 !== 1) probs.push(`h1=${a.h1}`);
    if (a.skip.length) probs.push(`skip ${a.skip}`);
    if (a.unlabelled.length) probs.push(`unlabelled ${a.unlabelled}`);
    if (a.nameless.length) probs.push(`nameless ${a.nameless}`);
    if (a.small.length) probs.push(`small ${a.small.join(" ; ")}`);
    if (w === 1512) { const f = await b.focusAudit(18); const inv = f.filter((x) => !x.vis).map((x) => x.el); if (!f.length || inv.length) probs.push(`focus invisible: ${inv.join(" ; ")}`); }
    chk(`${String(w).padStart(4)} ${p}`, probs.length === 0, probs.join(" | "));
    if (w === 1180) await b.shot(`a11y3-${WHO}-${p.replace(/\W+/g, "_")}-1180`);
  }
}
summary(); process.exit(0);

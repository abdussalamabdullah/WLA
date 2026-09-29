import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
const SLUG = "qa-a11y-probe";
const b = await launch({ port: 9500 });
await b.viewport(1512, 950);
await uiLogin(b, ...ACCOUNTS.admin);
await b.goto("/admin/builder", 500);
if (!/QA A11Y PROBE/.test(await b.text())) {
  await b.fill("#title", "QA A11Y PROBE"); await b.fill("#slug", SLUG);
  await b.click(/create/i, { selector: "button[type=submit]" }); await b.waitUrl(new RegExp(`/admin/builder/${SLUG}/1`), 40000);
}
await b.goto(`/admin/builder/${SLUG}/1`, 500);
// one screen from the (fixed) choice template, filled in via the UI
await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
await b.fill("#screen_key", "decide"); await b.fill("#type", "choice"); await sleep(300);
const tpl = await b.eval("document.querySelector('#configuration').value");
chk("choice template now includes the required prompt", /"prompt"/.test(tpl));
const filled = tpl.replace(/"prompt": ""/, '"prompt": "Pick one"').replace(/"id": "", "label": "", "next": ""/, '"id": "a", "label": "A", "next": "decide"').replace(/"id": "", "label": "", "next": ""/, '"id": "b", "label": "B", "next": "decide"');
await b.fill("#configuration", filled); await b.fill("#title", "Decision");
await b.click(/^add screen$/i, { selector: "button[type=submit]" });
for (let i = 0; i < 40; i++) { await sleep(500); if (/Screen saved|must|invalid|Expected|couldn/i.test(await b.eval("[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText).join(' ') + (document.body.innerText.includes('Screen saved.')?' Screen saved':'')"))) break; }
console.log("  form messages:", await b.eval("[...document.querySelectorAll('form [role=alert], form p')].map(x=>x.innerText.trim()).filter(t=>t && t.length<300).join(' || ')"));
chk("a decision saved straight from the template once its blanks were filled", /Screen saved/.test(await b.text()), (await b.text()).match(/Configuration[\s\S]{0,200}/)?.[0]);
for (const [w, h, mob] of [[390, 844, true], [834, 1112, false], [1512, 950, false]]) {
  await b.viewport(w, h, mob);
  for (const p of [`/admin/builder/${SLUG}/1`, `/admin/builder/${SLUG}/1/preview`, `/admin/missions/${SLUG}`]) {
    await b.goto(p, 400);
    // open the forms so they are audited too
    if (p.endsWith("/1")) { for (const re of [/^add a screen$/i, /^add a resource$/i]) { try { await b.click(re, { selector: "button" }); } catch {} } await b.click(/^preview$/i, { selector: "button" }).catch(() => {}); await sleep(400); }
    const a = await b.audit(); const probs = [];
    if (a.overflow > 0) probs.push(`overflow ${a.overflow}px ${a.over.join(",")}`);
    if (a.h1 !== 1) probs.push(`h1=${a.h1}`);
    if (a.skip.length) probs.push(`skip ${a.skip}`);
    if (a.unlabelled.length) probs.push(`unlabelled ${a.unlabelled}`);
    if (a.nameless.length) probs.push(`nameless ${a.nameless}`);
    if (a.small.length) probs.push(`small ${a.small.join(" ; ")}`);
    if (w === 1512) { const f = await b.focusAudit(25); const inv = f.filter((x) => !x.vis).map((x) => x.el); if (inv.length) probs.push(`focus invisible: ${inv.join(" ; ")}`); }
    chk(`${String(w).padStart(4)} ${p}`, probs.length === 0, probs.join(" | "));
    if (w === 390) await b.shot(`builder-${p.replace(/\W+/g, "_")}-390`);
  }
}
// clean up through the UI
await b.viewport(1512, 950);
await b.goto(`/admin/missions/${SLUG}`, 500);
await b.click(/^delete this mission$/i, { selector: "button" }); await sleep(300);
await b.click(/^yes, delete it$/i, { selector: "button" }); await sleep(3000);
await b.goto("/admin/missions", 500);
chk("probe mission deleted through the UI", !/QA A11Y PROBE/.test(await b.text()));
await b.close();
process.exit(summary() ? 1 : 0);

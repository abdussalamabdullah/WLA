import { launch, uiLogin, ACCOUNTS, chk, summary } from "./cdp.mjs";
const b = await launch({ port: 9510 });
await b.viewport(1512, 950);
await uiLogin(b, ...ACCOUNTS.parent);
await b.goto("/academy/my-missions", 500);
if (/Whose missions/.test(await b.text())) { await b.click(/Bilal/, { selector: "main button" }); await b.waitText(/Hi Bilal/, 60000); }
for (const [w, h, mob] of [[390, 844, true], [834, 1112, false], [1512, 950, false]]) {
  await b.viewport(w, h, mob);
  await b.goto("/academy/missions/six-names/active", 500);
  const a = await b.audit();
  const hdr = await b.eval("(()=>{const r=[...document.querySelectorAll('header *')].filter(e=>/^(Six Names|Mission Home|Mission Kit)$/.test(e.innerText?.trim())).map(e=>{const b=e.getBoundingClientRect(); return e.innerText.trim()+'@'+Math.round(b.top)+','+Math.round(b.left)}); const logo=document.querySelector('header img').getBoundingClientRect(); return r.join(' ')+' | logo@'+Math.round(logo.top)+','+Math.round(logo.left)+' | header h='+Math.round(document.querySelector('header').getBoundingClientRect().height);})()");
  console.log(`  ${w}: ${hdr}`);
  chk(`${w} active: no overflow, one h1, targets`, a.overflow <= 0 && a.h1 === 1 && a.small.length === 0, JSON.stringify(a));
  await b.shot(`active-header-${w}`);
}
await b.close(); process.exit(summary() ? 1 : 0);

import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
const b = await launch({ port: 9424 });
await b.viewport(1512, 950);
const show = async (label, n = 700) => console.log(`\n--- ${label} [${await b.url()}] h1=${JSON.stringify(await b.h1s())}\n` + (await b.text()).slice(0, n).replace(/\n+/g, " | "));
await uiLogin(b, ...ACCOUNTS.parent);
await b.goto("/academy/my-missions", 800);
await b.click(/Bilal/, { selector: "main button" });
await b.waitText(/Your Missions/, 60000);
await show("Bilal my-missions");
chk("Bilal's collection shows Six Names as In Progress with Continue", /six names/i.test(await b.text()) && /continue mission/i.test(await b.text()));
for (const [tab, re] of [["Not started", /No missions match|don.t have/i], ["Complete", /No missions match|don.t have/i], ["In progress", /Six Names/i], ["All", /Six Names/i]]) {
  await b.click(new RegExp("^" + tab), { selector: "[role=tab]" }); await sleep(300);
  const sel = await b.eval("document.querySelector('[role=tab][aria-selected=true]').innerText");
  chk(`tab "${tab}" filters (selected: ${sel})`, re.test(await b.text()));
}
const cardLinks = await b.eval("[...document.querySelectorAll('main a')].map(a=>a.innerText.trim()+' -> '+a.getAttribute('href'))");
console.log("  main links:", cardLinks);
await b.goto("/academy/missions/six-names", 800); await show("Mission Home (Bilal)", 900);
const home = await b.text();
chk("Mission Home: Continue is the action for In Progress (D-65)", /continue mission/i.test(home) && !/start mission/i.test(home));
chk("Mission Home offers Kit and For Parents", /mission kit/i.test(home) && /for parents/i.test(home));
await b.goto("/academy/missions/six-names/kit", 1500); await show("Mission Kit", 900);
const kitLinks = await b.eval("[...document.querySelectorAll('main a')].filter(a=>/sign|storage|pdf/i.test(a.href)).length");
chk("Kit lists 5 resources with working signed links", kitLinks >= 5, String(kitLinks));
const firstPdf = await b.eval("([...document.querySelectorAll('main a')].find(a=>/storage\\/v1\\/object\\/sign/.test(a.href))||{}).href || null");
if (firstPdf) { const r = await fetch(firstPdf); chk("a Kit link actually downloads a PDF", r.ok && /pdf/.test(r.headers.get("content-type") || ""), `${r.status} ${r.headers.get("content-type")}`); }
await b.send("Page.navigate", { url: "http://localhost:3100/academy/missions/six-names/parents" });
let loc = ""; for (let i = 0; i < 60; i++) { await sleep(500); try { loc = await b.eval("location.href"); } catch {} if (!/localhost/.test(loc)) break; }
chk("For Parents opens the parent-note PDF via a signed URL", /storage\/v1\/object\/sign\/.*parent-note\.pdf/.test(loc), loc.slice(0, 90));
await b.goto("/academy/missions/six-names/trail", 1000); await show("Trail (Bilal, in progress)", 600);
await b.goto("/academy/missions/six-names/complete", 800);
chk("Bilal (in progress) opening /complete is sent back to Mission Home", /\/academy\/missions\/six-names$/.test(await b.url()), await b.url());
// switch to Cara via the header switcher
await b.goto("/academy/my-missions", 800);
const sw = await b.eval("[...document.querySelectorAll('button')].filter(e=>/'s Missions/.test(e.innerText)).map(e=>e.innerText.trim()+' | expanded='+e.getAttribute('aria-expanded')+' | haspopup='+e.getAttribute('aria-haspopup'))");
console.log("  switcher:", sw);
await b.click(/'s Missions/, { selector: "button" }); await sleep(600);
console.log("  switcher options:", await b.eval("[...document.querySelectorAll('[role=menu] *, [role=listbox] *, [role=dialog] button, [data-radix-popper-content-wrapper] button, [role=menuitem], [role=option]')].map(e=>e.getAttribute('role')+':'+e.innerText.trim()).filter((v,i,a)=>a.indexOf(v)===i).slice(0,10)"));
await b.click(/Cara/, { selector: "[role=menuitem], [role=option], [role=menuitemradio], [role=dialog] button, [data-radix-popper-content-wrapper] button" });
chk("switcher: Cara selected", await b.waitText(/Hi Cara/, 90000)); await sleep(800);
await show("after switch to Cara", 500);
chk("switching child switches the whole collection (Cara: Complete → View Mission)", /view mission/i.test(await b.text()) && !/continue mission/i.test(await b.text()));
await b.goto("/academy/missions/six-names", 800);
chk("Cara's Mission Home: View Mission, not Continue", /view mission/i.test(await b.text()) && !/continue mission/i.test(await b.text()));
await b.goto("/academy/missions/six-names/trail", 1000); await show("Trail (Cara, complete)", 900);
chk("Cara's Trail has entries", (await b.h1s())[0] === "Mission Trail" && !/nothing here yet|no entries/i.test(await b.text()), JSON.stringify(await b.h1s()));
await b.goto("/academy/missions/six-names/complete", 1000); await show("Complete (Cara)", 400);
chk("Cara (complete) sees the completion page", /\/complete$/.test(await b.url()) && (await b.h1s())[0] === "Six Names" && /You finished something/.test(await b.text()), JSON.stringify(await b.h1s()));
await b.goto("/account", 800); await show("Account", 600);
await b.goto("/account/children", 800); await show("Children", 600);
console.log(`  error-boundary hits: ${b.stats.boundary}, recovered by Try Again: ${b.stats.recovered}`);
await b.close();
process.exit(summary() ? 1 : 0);

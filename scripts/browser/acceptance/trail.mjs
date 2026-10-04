// F6 Trail v2 on staging for BOTH actors: the parent viewing a child's Trail,
// and the child in their own access-code session (child_session_trail v2).
import { launch, uiLogin, sleep, chk, summary } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const kid = kids.find((k) => k.display_name === "QA Ask Pause");
const P = await launch({ port: 9532 }), C = await launch({ port: 9533 });
await P.viewport(1512, 950); await C.viewport(390, 844);

async function checkTrail(b, who) {
  await b.goto("/academy/missions/six-names/trail", 1000);
  const t = await b.eval("document.querySelector('main').innerText");
  const times = await b.eval("[...document.querySelectorAll('main li time')].map(x=>x.getAttribute('datetime'))");
  chk(`${who}: the Trail names its Lab`, /Lab/.test(t.split("Mission Trail")[0]), t.slice(0, 120));
  chk(`${who}: every entry is dated`, times.length > 0 && times.length === (await b.eval("document.querySelectorAll('main li').length")), JSON.stringify(times.slice(0, 2)));
  chk(`${who}: entries say when they were kept (at the end)`, /at the end/.test(t));
  chk(`${who}: physical entries still never imply a stored copy`, !/You keep this[^\n]*\n[^\n]*\n?.*View/.test(t));
  for (const [w, h] of [[390, 844], [1512, 950]]) {
    await b.viewport(w, h); await sleep(250);
    const a = await b.audit();
    chk(`${who} @${w}: no overflow, small targets or heading skips`, a.overflow <= 0 && !a.small.length && !a.skip.length && a.h1 === 1, JSON.stringify({ o: a.overflow, s: a.small, k: a.skip, h1: a.h1 }));
  }
  await b.shot(`trail-${who}`);
}

await uiLogin(P, q.email, q.password);
await P.goto("/academy/my-missions", 800);
if (await P.has(/QA Ask Pause/, "main button")) await P.click(/QA Ask Pause/, { selector: "main button" });
else { await P.click(/Missions/, { selector: "header button" }); await sleep(300); await P.click(/QA Ask Pause/, { selector: "header button, header [role=menuitem], header a" }); }
await sleep(1200);
await checkTrail(P, "parent");

await P.goto(`/account/children/${kid.id}`, 800);
await P.click(/^(create a code|make a new code)$/i, { selector: "button" }); await P.waitText(/new code\. Write it down/i, 30000);
const code = await P.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
await C.goto("/child/login", 300); await C.fill("input[name=code]", code);
await C.click(/continue/i, { selector: "button[type=submit]" }); await C.waitUrl(/\/academy/, 40000);
await checkTrail(C, "child");

// leave the account as we found it: turn the code off again
await P.goto(`/account/children/${kid.id}`, 800);
await P.click(/^turn off this code$/i, { selector: "button" });
chk("QA code turned off again", await P.waitText(/No code yet/, 20000));
await P.close?.(); await C.close?.();
summary();

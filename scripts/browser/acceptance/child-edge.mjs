import { launch, chk, summary, uiLogin, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const kid = kids.find((k) => k.display_name === "QA Stop Away");
const P = await launch({ port: 9470 }), C = await launch({ port: 9471 });
await P.viewport(1512, 950); await C.viewport(390, 844, true);
const tryCode = async (code) => {
  await C.clearCookies(); await C.goto("/child/login", 300);
  await C.fill("input[name=code]", code); await C.click(/continue/i, { selector: "button[type=submit]" });
  for (let i = 0; i < 60; i++) { await sleep(500); if (/\/academy/.test(await C.url())) return "in"; const t = await C.text(); if (/didn.t work|Too many|couldn.t check|8 letters/i.test(t)) return t.match(/(That code didn.t work[^.]*\.|Too many tries[^.]*\.|We couldn.t check[^.]*\.|A child code has 8[^.]*\.)/)?.[0] ?? "error"; }
  return "timeout";
};
const newCode = async () => {
  await P.goto(`/account/children/${kid.id}`, 600);
  await P.click(/^(create a code|make a new code)$/i, { selector: "button" });
  await P.waitText(/new code\. Write it down/i, 30000);
  return P.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
};
await uiLogin(P, q.email, q.password);

// malformed and wrong codes
chk("malformed code is explained, not accepted", /8 letters/.test(await tryCode("abc")));
const wrong = "ZQZQ-" + String(1000 + Math.floor(Math.random() * 8999));
const results = [];
for (let i = 0; i < 6; i++) results.push(await tryCode(wrong));
console.log("  wrong-code attempts:", results.map((r) => r.slice(0, 22)));
chk("a wrong code says it didn't work (same message, no hint)", /didn.t work/.test(results[0]));
chk("rate limiting engages by the 6th wrong try", /Too many tries/.test(results[5]));

// valid code works; child session lasts; parent regenerates → old code dead, new works
const c1 = await newCode();
chk("a freshly made code signs the child in", (await tryCode(c1)) === "in");
await C.goto("/academy/my-missions", 400);
chk("signed-in child sees their own collection", /Six Names/.test(await C.text()));
const c2 = await newCode();
chk("making a new code stops the old one working", /didn.t work/.test(await tryCode(c1)));
chk("the new code works", (await tryCode(c2)) === "in");

// revoke while the child is signed in
await P.goto(`/account/children/${kid.id}`, 600);
await P.click(/^turn off this code$/i, { selector: "button" }); await sleep(2500);
await P.goto(`/account/children/${kid.id}`, 600);
chk("parent sees the code is off", /No code yet/.test(await P.text()));
await C.goto("/academy/my-missions", 600);
const afterRevoke = await C.url();
console.log("  child after revoke:", afterRevoke, (await C.text()).slice(0, 80).replace(/\n+/g, " | "));
chk("turning off the code ends the child's open session", /\/child\/login|\/login/.test(afterRevoke));
chk("a turned-off code cannot sign in", /didn.t work/.test(await tryCode(c2)));

// child's header: no parent controls; logout
const c3 = await newCode();
await tryCode(c3); await C.goto("/academy/my-missions", 400);
const hdr = await C.eval("(document.querySelector('header, nav')||document.body).innerText");
chk("child header has no switcher, account or purchase", !/Account|Choose a child|Whose missions|Purchase|Get this mission/i.test(hdr), hdr.replace(/\n+/g, " | "));
await C.goto("/child/logout", 400); await C.click(/^log out$/i, { selector: "main button[type=submit]" }); await C.waitUrl(/login/, 30000);
await C.goto("/academy/my-missions", 400);
chk("after logout the child session is gone", /login/.test(await C.url()));
chk("the logged-out session's code still works for a fresh sign-in", (await tryCode(c3)) === "in");
// tidy: turn the code off again
await P.goto(`/account/children/${kid.id}`, 600); await P.click(/^turn off this code$/i, { selector: "button" }); await sleep(1500);
await P.close(); await C.close();
process.exit(summary() ? 1 : 0);

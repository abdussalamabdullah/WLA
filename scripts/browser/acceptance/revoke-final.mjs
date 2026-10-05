// FINAL QA — turning off a child's code ends their open session, measured
// against the database: load the child's page only once revocation committed.
import { launch, chk, summary, uiLogin, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const svc = async (p) => (await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const kid = (await svc(`child_profiles?select=id,display_name&display_name=like.QA%20Final*&order=created_at.desc&limit=1`))[0];
const P = await launch({ port: 9597 }), C = await launch({ port: 9598 });
await P.viewport(1512, 950); await C.viewport(390, 844, true);
await uiLogin(P, q.email, q.password);
for (let round = 1; round <= 3; round++) {
  await C.clearCookies();
  await P.goto(`/account/children/${kid.id}`, 800);
  await P.click(/^(create a code|make a new code)$/i, { selector: "button" });
  await P.waitText(/new code\. Write it down/i, 30000);
  const code = await P.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
  await C.goto("/child/login", 400);
  for (let i = 0; i < 40 && !(await C.eval("!!document.querySelector('input[name=code]')")); i++) await sleep(500);
  await C.fill("input[name=code]", code); await C.click(/continue/i, { selector: "button[type=submit]" });
  await C.waitUrl(/\/academy/, 40000);
  await C.goto("/academy/my-missions", 1500);
  const inBefore = /Here are your missions/.test(await C.eval("document.body.innerText"));
  await P.goto(`/account/children/${kid.id}`, 800);
  const t0 = Date.now();
  await P.click(/^turn off this code$/i, { selector: "button" });
  let live = 1;
  for (let i = 0; i < 120 && live; i++) { live = (await svc(`child_sessions?child_id=eq.${kid.id}&revoked_at=is.null&select=id`)).length; if (live) await sleep(250); }
  const committedMs = Date.now() - t0;
  await C.goto("/academy/my-missions", 2500);
  const url = await C.url(), body = await C.eval("document.body.innerText");
  chk(`round ${round}: signed in before; after revocation committed (${committedMs}ms) the child is signed out`, inBefore && live === 0 && /login/.test(url) && !/Here are your missions/.test(body), `${inBefore} live=${live} ${url}`);
}
await P.close?.(); await C.close?.(); summary(); process.exit(0);

import { launch, uiLogin, sleep, chk, summary } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}` };
const b = await launch({ port: 9520 });
await b.viewport(1512, 950);
await uiLogin(b, q.email, q.password);
for (let n = 0; n < 10; n++) {
  await b.goto("/account/children", 600);
  const i = await b.eval("[...document.querySelectorAll('li')].findIndex(li=>/^QA /m.test(li.innerText))");
  if (i < 0) break;
  await b.eval(`[...document.querySelectorAll('li')][${i}].querySelectorAll('button').forEach(x=>{ if(/^remove$/i.test(x.innerText.trim())) x.click(); })`);
  await sleep(500); await b.click(/^remove profile$/i, { selector: "button" }); await sleep(2500);
}
await b.goto("/account/children", 600);
chk("all QA children removed through the parent UI", !/QA (Ask|Stop|Builder)/.test(await b.text()));
await b.close();
const users = await (await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: H })).json();
const u = users.users.find((x) => x.email === q.email);
const del = await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: H });
chk("QA parent account deleted", del.ok, String(del.status));
const left = await (await fetch(`${SB}/rest/v1/profiles?email=eq.${encodeURIComponent(q.email)}&select=id`, { headers: H })).json();
chk("no QA parent profile left", Array.isArray(left) && left.length === 0, JSON.stringify(left));
process.exit(summary() ? 1 : 0);

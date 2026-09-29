import { launch, chk, summary, uiLogin } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const b = await launch({ port: 9422 });
await b.viewport(1512, 950);
const landed = await uiLogin(b, q.email, q.password);
console.log("  landed:", landed, "|", (await b.text()).slice(0, 200).replace(/\n+/g, " | "));
chk("QA parent signs in through the UI", !/\/login/.test(landed));
const names = ["QA Ask Pause", "QA Ask Share", "QA Ask Away", "QA Stop Pause", "QA Stop Share", "QA Stop Away", "QA Builder Child"];
await b.goto("/account/children");
let have = await b.text();
for (const n of names) {
  if (have.includes(n)) continue;
  await b.goto("/account/children/new");
  await b.fill("input[name=displayName]", n); await b.fill("input[name=birthYear]", "2016");
  await b.click(/add|save|create/i, { selector: "button[type=submit]" });
  await b.waitUrl(/\/account\/children$/, 20000);
  have = await b.text();
}
chk("7 QA children created through the parent UI", names.every((n) => have.includes(n)), have.slice(0, 300));
await b.close();
process.exit(summary() ? 1 : 0);

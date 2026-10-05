// Account (Plan §1, D-100..): each child's missions with status, privacy and
// permissions (Trail privacy, access-code status per child, Board decisions),
// and the approved support copy — read from the real page.
import { launch, chk, summary, uiLogin } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const b = await launch({ port: 9583 }); await b.viewport(1512, 950);
await uiLogin(b, q.email, q.password);
await b.goto("/account", 2000);
const t = await b.eval("document.querySelector('main').innerText");
chk("each child is listed with their missions and status in words", /QA Ask Pause R4[\s\S]{0,200}Six Names — (Complete|In progress|Not started)/.test(t), t.slice(0, 400).replace(/\n+/g, " | "));
chk("Privacy and permissions: Trail privacy stated", /Mission Trail is private to them/.test(t));
chk("Privacy and permissions: access-code status per child, with a way to manage it", /QA Ask Pause R4: (a code is active|no code)/.test(t) && (await b.eval("[...document.querySelectorAll('main a')].some(a=>/Manage/.test(a.innerText) && /\\/account\\/children\\//.test(a.getAttribute('href')))")));
chk("Privacy and permissions: Mission Board decisions live here", /Mission Board: nothing has been offered|Mission Board\n/.test(t));
chk("Need help? uses the approved support copy and links", /Already have a mission\? Find it in My Missions\./.test(t) && /Go to My Missions →/.test(t) && /Explore Missions →/.test(t));
chk("no prices, purchase history or child data beyond names and statuses", !/£|Order|Receipt/.test(t));
await b.close?.(); summary(); process.exit(0);

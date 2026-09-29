import { launch, chk, summary, uiLogin } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const kid = kids.find((k) => k.display_name === "QA Builder Child");
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const svc = async (path) => (await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
const b = await launch({ port: 9464 });
await b.viewport(1512, 950);
await uiLogin(b, q.email, q.password);
await b.goto(`/account/children/${kid.id}`, 600);
await b.click(/^(create a code|make a new code)$/i, { selector: "button" });
await b.waitText(/new code\. Write it down/i, 30000);
const code = await b.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
await b.clearCookies(); await b.goto("/child/login", 400);
await b.fill("input[name=code]", code); await b.click(/continue/i, { selector: "button[type=submit]" }); await b.waitUrl(/\/academy/, 40000);
await b.goto("/academy/my-missions", 600);
const mm = await b.text();
chk("child's collection lists only their own mission (QA mission, not Six Names)", /AUTONOMOUS QA TEST MISSION/.test(mm) && !/Six Names/.test(mm));
chk("QA mission shows Complete → View Mission", /View Mission/.test(mm));
await b.goto("/academy/missions/autonomous-qa-test-mission/complete", 600);
chk("completion page renders closure", /You finished something/.test(await b.text()) && (await b.h1s())[0] === "AUTONOMOUS QA TEST MISSION");
await b.goto("/academy/missions/autonomous-qa-test-mission/trail", 800);
const t = await b.text();
chk("Trail holds the child's own answer", t.includes("The gate was open and I shut it.") && /What I noticed/.test(t), t.slice(0, 300).replace(/\n+/g, " | "));
await b.goto("/academy/missions/six-names", 600);
chk("child cannot open a mission they are not entitled to (Six Names → not found)", /couldn.t find/i.test(await b.text()));
for (const sub of ["", "/kit", "/trail", "/active", "/parents", "/complete"]) { await b.goto("/academy/missions/six-names" + sub, 400); chk(`unentitled child: six-names${sub} → "couldn't find", no content`, /couldn.t find that/i.test(await b.text()) && !/Case Board|office assistant|Decision 1/.test(await b.text())); }
for (const p of ["/account", "/account/children", "/admin", "/purchase/autonomous-qa-test-mission"]) {
  await b.goto(p, 400);
  chk(`child cannot reach parent-only ${p}`, !new RegExp("^" + p.replace(/\//g, "\\/")).test(await b.url()) || /sign in|not found|couldn.t/i.test(await b.text()), await b.url());
}
const prog = await svc(`mission_progress?child_id=eq.${kid.id}&select=mission_version,status,missions!inner(slug)&missions.slug=eq.autonomous-qa-test-mission`);
chk("run is pinned to v1 and complete", prog[0]?.mission_version === 1 && prog[0]?.status === "complete", JSON.stringify(prog));
await b.close();
process.exit(summary() ? 1 : 0);

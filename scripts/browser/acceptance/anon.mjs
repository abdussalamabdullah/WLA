import { launch, chk, summary } from "./cdp.mjs";
const b = await launch({ port: 9421 });
await b.viewport(1512, 950);
const visit = async (p) => { const u = await b.goto(p, 800); const t = await b.text(); return { u, t, h1: await b.h1s() }; };

let r = await visit("/");
chk("home renders with one h1", r.h1.length === 1, JSON.stringify(r.h1));
r = await visit("/missions");
console.log("  /missions h1:", r.h1, "| mentions Six Names:", /six names/i.test(r.t));
chk("catalogue does not list unpublished Six Names", !/six names/i.test(r.t));
r = await visit("/missions/six-names");
console.log("  /missions/six-names ->", r.u, r.h1);
chk("unpublished Six Names page is not served publicly", /not found|404|couldn.t find/i.test(r.t) || r.u !== "/missions/six-names", r.t.slice(0, 120));
r = await visit("/purchase/six-names");
console.log("  /purchase/six-names ->", r.u, r.h1);
chk("unpublished Six Names cannot be purchased", !/pay|checkout|£|buy/i.test(r.t) || /not found|404|sign in|log in/i.test(r.t), r.t.slice(0, 160));
r = await visit("/try-free");
console.log("  /try-free ->", r.u, r.h1, r.t.slice(0,160).replace(/\n/g," | "));
for (const p of ["/academy/my-missions", "/academy/missions/six-names", "/academy/missions/six-names/active", "/academy/missions/six-names/kit", "/academy/missions/six-names/parents", "/academy/missions/six-names/trail", "/account", "/account/children", "/admin", "/admin/builder", "/admin/missions/six-names", "/academy/mission-board"]) {
  r = await visit(p);
  const leaked = /Ada|Bilal|Cara|Idris|Layla|wla-review/i.test(r.t);
  chk(`anon ${p} → login, no data`, /\/login|\/child\/login/.test(r.u) && !leaked, `${r.u} h1=${r.h1}`);
}
const apiKit = await fetch("http://localhost:3100/api/kit/00000000-0000-0000-0000-000000000000", { redirect: "manual" });
chk("anon /api/kit → 404", apiKit.status === 404, String(apiKit.status));
r = await visit("/login");
chk("login page: email + password labelled", (await b.audit()).unlabelled.length === 0 && /email/i.test(r.t) && /password/i.test(r.t));
r = await visit("/signup");
chk("signup page renders", r.h1.length === 1 && /sign up|create/i.test(r.t), JSON.stringify(r.h1));
r = await visit("/child/login");
chk("child login page renders a code field", r.h1.length === 1 && (await b.eval("!!document.querySelector('input')")), JSON.stringify(r.h1));
console.log("  child login copy:", r.t.slice(0, 300).replace(/\n+/g, " | "));
await b.close();
process.exit(summary() ? 1 : 0);

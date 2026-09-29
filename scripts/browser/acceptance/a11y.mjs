import { launch, chk, summary, uiLogin, ACCOUNTS } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const PAGES = (process.env.PAGES ?? "/,/login,/signup,/child/login,/forgot-password,/try-free").split(",");
const WHO = process.env.WHO;
const b = await launch({ port: 9450 + Math.floor(Math.random() * 40) });
if (WHO === "parent") await uiLogin(b, ...ACCOUNTS.parent);
if (WHO === "admin") await uiLogin(b, ...ACCOUNTS.admin);
if (WHO === "qa") { const q = JSON.parse(readFileSync("qa-parent.json", "utf8")); await uiLogin(b, q.email, q.password); }
for (const [w, h, mob] of [[390, 844, true], [834, 1112, false], [1512, 950, false]]) {
  await b.viewport(w, h, mob);
  for (const p of PAGES) {
    await b.goto(p, 500);
    const a = await b.audit();
    const tag = `${String(w).padStart(4)} ${p}`;
    chk(`${tag}: no horizontal overflow`, a.overflow <= 0, `${a.overflow}px ${a.over.join(", ")}`);
    chk(`${tag}: exactly one h1`, a.h1 === 1, String(a.h1));
    chk(`${tag}: no skipped heading levels`, a.skip.length === 0, a.skip.join(","));
    chk(`${tag}: every field labelled`, a.unlabelled.length === 0, a.unlabelled.join(","));
    chk(`${tag}: every control has a name`, a.nameless.length === 0, a.nameless.join(","));
    chk(`${tag}: touch targets ≥ 44px`, a.small.length === 0, a.small.join(" ; "));
    if (w === 1512) {
      const f = await b.focusAudit(20);
      const invisible = f.filter((x) => !x.vis).map((x) => x.el);
      chk(`${tag}: keyboard focus visible on every stop (${f.length} stops)`, f.length > 0 && invisible.length === 0, invisible.join(" ; "));
    }
    if (w === 390) await b.shot(`a11y-${WHO ?? "anon"}-${p.replace(/\W+/g, "_") || "home"}-390`);
  }
}
await b.close();
process.exit(summary() ? 1 : 0);

// WCAG 1.4.4 — text resized to 200% (Plan §11 "responsive text scaling").
// Two ways a person gets there: the browser's text-size setting (emulated by
// a 200% root font size — WLA's type is rem-based) and browser zoom 200%
// (a 640px-wide viewport at desktop). Checks: no page overflow, no clipped
// text, targets still 44px, one h1.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (p, init = {}) => (await fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));

const b = await launch({ port: 9578 });
async function audit(label) {
  await b.eval("document.documentElement.style.fontSize='200%'"); await sleep(400);
  const r = await b.eval(`(()=>{const cw=document.documentElement.clientWidth;
    const clipped=[...document.querySelectorAll('main *')].filter(e=>{ if(!e.childNodes.length||![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) return false; const s=getComputedStyle(e); if (e.closest('.sr-only') || e.getBoundingClientRect().width<=1) return false; return (s.overflow==='hidden'||s.overflowX==='hidden'||s.textOverflow==='ellipsis') && e.scrollWidth>e.clientWidth+1; }).slice(0,4).map(e=>e.tagName+':'+e.innerText.slice(0,30));
    const small=[...document.querySelectorAll('main a[href], main button, main input:not([type=hidden]), main select, main textarea')].filter(e=>{const lab=e.closest('label'); const r=(lab && lab.getBoundingClientRect().height>=43.5 ? lab : e).getBoundingClientRect(); const inText=e.tagName==='A'&&getComputedStyle(e).display==='inline'; return r.width>0&&!inText&&r.height<43.5&&r.width<43.5;}).slice(0,4).map(e=>(e.innerText||e.name||e.tagName).slice(0,20));
    const wide=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); if(r.right<=cw+1||r.width===0) return false; let p=e.parentElement; while(p){const o=getComputedStyle(p).overflowX; if(o!=='visible') return false; p=p.parentElement;} return getComputedStyle(e).position!=='fixed';}).slice(0,3).map(e=>e.tagName+'.'+String(e.className).slice(0,50)+' «'+(e.innerText||'').slice(0,25)+'» r='+Math.round(e.getBoundingClientRect().right));
    return {overflow: document.documentElement.scrollWidth-cw, wide, clipped, small, h1: document.querySelectorAll('h1').length};})()`);
  chk(`${label}: no overflow, clipping or small targets at 200% text`, r.overflow <= 0 && !r.clipped.length && !r.small.length && r.h1 === 1, JSON.stringify(r));
}
async function pages(list, tag) {
  for (const [w, h] of [[1280, 900], [834, 1112], [390, 844], [640, 800]]) {
    await b.viewport(w, h, w < 500);
    for (const p of list) { await b.goto(p, 800); await audit(`${tag} ${w} ${p}`); }
  }
}

// a disposable child with Six Names started, to audit a live Active Mission screen
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const six = JSON.parse(readFileSync("qa-kids.json", "utf8")).sixId;
const kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: `QA Text ${Date.now().toString(36).slice(-4)}`, birth_year: 2014 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: six, source: "admin", status: "active" }) });

await b.viewport(1280, 900);
await uiLogin(b, q.email, q.password);
await b.cookies([{ name: "wla_active_child", value: kid.id }]);
await b.goto("/academy/missions/six-names", 1000);
await b.click(/^start mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000); await sleep(1500);
const done = kids.find((k) => k.display_name === "QA Ask Pause");
await pages(["/academy/missions/six-names/active", "/academy/my-missions", "/academy/missions/six-names", "/academy/missions/six-names/kit", "/account"], "learner");
await b.cookies([{ name: "wla_active_child", value: done.id }]);
await pages(["/academy/missions/six-names/trail", "/academy/mission-board"], "learner");

await uiLogin(b, ...ACCOUNTS.admin);
const forms = JSON.parse(readFileSync("/tmp/wla-qa/forms-mission.json", "utf8")).slug;
await pages([`/admin/builder/${forms}/2`, `/admin/builder/${forms}/2/preview`, `/admin/analytics/${forms}`, "/admin/analytics", "/admin", "/admin/board"], "admin");
await b.close?.();
summary();

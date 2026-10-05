// Minimal interactive CDP driver for WLA browser QA (no npm deps).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

export const BASE = process.env.BASE ?? "http://localhost:3100";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export { sleep };

export async function launch({ port = 9420, out = process.env.QA_OUT ?? "/tmp/wla-qa/out", args = [] } = {}) {
  mkdirSync(out, { recursive: true });
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", `--user-data-dir=${out}/profile-${port}-${Date.now()}`, ...args, "about:blank",
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

  const b = {
    out, send, events, stats: { boundary: 0, recovered: 0 },
    async viewport(w, h = 900, mobile = false) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    },
    async cookies(list, url = BASE) {
      for (const c of list) await send("Network.setCookie", { name: c.name, value: c.value, url, path: "/" });
    },
    async clearCookies() { await send("Network.clearBrowserCookies"); },
    async getCookies() { return (await send("Network.getCookies", { urls: [BASE] })).cookies; },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    },
    async idle(ms = 400) {
      // wait for document ready and no navigation churn
      for (let i = 0; i < 60; i++) {
        try { if ((await b.eval("document.readyState")) === "complete") break; } catch {}
        await sleep(150);
      }
      await sleep(ms);
    },
    async goto(path, wait = 600) {
      events.length = 0;
      await send("Page.navigate", { url: path.startsWith("http") ? path : BASE + path });
      await sleep(300); await b.idle(200);
      // streamed pages show a loading state first; wait for real content
      const t0 = Date.now();
      while (Date.now() - t0 < 45000) {
        try {
          const ready = await b.eval("!!document.querySelector('h1') && !/^\\s*Loading/.test(document.body.innerText) || !/^https?:\\/\\/localhost/.test(location.href)");
          if (ready) break;
        } catch {}
        await sleep(300);
      }
      // wait for React to hydrate, or clicks land on inert buttons
      for (let i = 0; i < 100; i++) {
        try { if (await b.eval("(() => { const el = document.querySelector('main button, main a, form button, header button'); return !el || Object.keys(el).some(k => k.startsWith('__reactProps')); })()")) break; } catch {}
        await sleep(200);
      }
      await sleep(wait);
      // Transient staging failures now land on the error boundary (fail
      // closed). Prove its Try Again recovers rather than retry by reloading.
      for (let i = 0; i < 4; i++) {
        const h = await b.eval("(document.querySelector('h1')||{}).innerText||''").catch(() => "");
        if (!/Something went wrong|couldn.t load/i.test(h)) break;
        const btn = await b.eval("!![...document.querySelectorAll('button')].find(x=>/^try again$/i.test(x.innerText.trim()))");
        if (!btn) break;
        b.stats.boundary++;
        await b.eval("[...document.querySelectorAll('button')].find(x=>/^try again$/i.test(x.innerText.trim())).click()");
        for (let j = 0; j < 60; j++) { await sleep(500); const h2 = await b.eval("(document.querySelector('h1')||{}).innerText||''").catch(() => ""); if (h2 && !/Something went wrong/i.test(h2)) { b.stats.recovered++; break; } }
      }
      return b.url();
    },
    url: () => b.eval("location.pathname + location.search"),
    text: () => b.eval("document.body.innerText"),
    h1s: () => b.eval("[...document.querySelectorAll('h1')].map(h=>h.innerText.trim())"),
    async waitText(re, timeout = 15000) {
      const rx = re instanceof RegExp ? re : new RegExp(re);
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try { if (rx.test(await b.text())) return true; } catch {}
        await sleep(250);
      }
      return false;
    },
    async waitUrl(re, timeout = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) { try { if (re.test(await b.url())) return true; } catch {} await sleep(200); }
      return false;
    },
    // click the first visible element (button/link/label/[role]) whose accessible text matches
    async click(match, { selector = "button, a, [role=button], [role=tab], [role=option], [role=menuitem], [role=radio], label, summary", exact = false, nth = 0 } = {}) {
      const src = match instanceof RegExp ? match.source : match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flags = match instanceof RegExp ? match.flags : "i";
      const ok = await b.eval(`(() => {
        const rx = new RegExp(${JSON.stringify(exact ? `^\\s*${src}\\s*$` : src)}, ${JSON.stringify(flags)});
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => {
          const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
          const label = (e.innerText || e.getAttribute('aria-label') || e.value || '').trim();
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && rx.test(label) && !e.disabled;
        });
        const el = els[${nth}]; if (!el) return false;
        el.scrollIntoView({block:'center'}); el.click(); return true;
      })()`);
      if (!ok) throw new Error(`click: nothing matches ${match}`);
      await sleep(250);
      return ok;
    },
    async has(match, selector = "button, a, [role=button], [role=tab]") {
      try { await b.eval("0"); } catch {}
      const src = match instanceof RegExp ? match.source : match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return b.eval(`[...document.querySelectorAll(${JSON.stringify(selector)})].some(e => { const r=e.getBoundingClientRect(); return r.width>0 && new RegExp(${JSON.stringify(src)}, 'i').test((e.innerText||e.getAttribute('aria-label')||'').trim()); })`);
    },
    // set value on an input/textarea/select via React-compatible setter
    async fill(selector, value) {
      const ok = await b.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));
        return true; })()`);
      if (!ok) throw new Error(`fill: no ${selector}`);
    },
    async check(selector, on = true) {
      await b.eval(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if (el && el.checked !== ${on}) el.click(); })()`);
    },
    async setFile(selector, path) {
      const { root } = await send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error("setFile: no " + selector);
      await send("DOM.setFileInputFiles", { nodeId, files: [path] });
    },
    async shot(name) {
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(`${out}/${name}.png`, Buffer.from(data, "base64"));
      return `${out}/${name}.png`;
    },
    // rendered layout/a11y metrics
    audit: () => b.eval(`(() => {
      const de = document.documentElement, cw = de.clientWidth;
      const over = [...document.querySelectorAll('body *')].filter(e => { const r=e.getBoundingClientRect(); return r.width>0 && r.right > cw + 1 && getComputedStyle(e).position!=='fixed'; })
        .slice(0,5).map(e => e.tagName.toLowerCase() + (e.className && typeof e.className==='string' ? '.'+e.className.split(' ')[0] : '') + ' r=' + Math.round(e.getBoundingClientRect().right));
      const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h=>h.getBoundingClientRect().width>0 || h.classList.contains('sr-only')).map(h => +h.tagName[1]);
      let skip = []; for (let i=1;i<heads.length;i++) if (heads[i] > heads[i-1]+1) skip.push(heads[i-1]+'→'+heads[i]);
      const inter = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab]')].filter(e => { const r=e.getBoundingClientRect(); return r.width>0 && r.height>0; });
      const small = inter.filter(e => { const lab = e.closest('label'); const r=(lab && lab.getBoundingClientRect().height >= 43.5 ? lab : e).getBoundingClientRect(); const inText = e.tagName==='A' && e.closest('p,li') && getComputedStyle(e).display==='inline'; return !inText && (r.height < 43.5 && r.width < 43.5 || r.height < 24); })
        .slice(0,6).map(e => (e.innerText||e.getAttribute('aria-label')||e.name||e.tagName).trim().slice(0,30) + ' ' + Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height));
      const unlabelled = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.closest('label')).map(e => e.name || e.id || e.type);
      const nameless = inter.filter(e => !(e.innerText||'').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title && !(e.labels&&e.labels.length) && !e.querySelector('img[alt]:not([alt=""]), svg[aria-label], [aria-label]') && !['INPUT','SELECT','TEXTAREA'].includes(e.tagName)).map(e=>e.tagName+':'+(e.getAttribute('href')||''));
      return { overflow: de.scrollWidth - cw, over, h1: heads.filter(h=>h===1).length, skip, small, unlabelled, nameless };
    })()`),
    // tab through the page, report whether focus is visible for each focused element
    async focusAudit(max = 25) {
      await b.eval("document.activeElement && document.activeElement.blur(); window.scrollTo(0,0)");
      const res = [];
      for (let i = 0; i < max; i++) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
        await sleep(40);
        res.push(await b.eval(`(() => { const e=document.activeElement; if(!e||e===document.body) return null; const s=getComputedStyle(e);
          const vis = (s.outlineStyle!=='none' && parseFloat(s.outlineWidth)>0) || s.boxShadow!=='none';
          return { el:(e.innerText||e.getAttribute('aria-label')||e.name||e.tagName).trim().slice(0,28), vis }; })()`));
      }
      return res.filter(Boolean);
    },
    async close() { try { await send("Browser.close"); } catch {} proc.kill(); },
  };
  return b;
}

// Supabase cookies for a parent/admin, produced by @supabase/ssr itself.
export async function parentCookies(email, password) {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
  const SB_URL = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim();
  const SB_ANON = /NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)[1].trim();
  const out = `./ck-${email.split("@")[0]}.json`;
  execFileSync("node", [new URL("../session-cookies.cjs", import.meta.url).pathname], {
    env: { ...process.env, SB_URL, SB_ANON, EMAIL: email, PASSWORD: password, OUT: out }, stdio: "pipe",
  });
  return JSON.parse(readFileSync(out, "utf8"));
}

export const ACCOUNTS = {
  admin: ["wla-review-admin@wla-staging.test", "WLA-Review-Admin-2026"],
  parent: ["wla-review-parent@wla-staging.test", "WLA-Review-Parent-2026"],
  family: ["wla-review-family@wla-staging.test", "WLA-Review-Family-2026"],
};

let pass = 0, fail = 0; const failures = [];
export function chk(label, ok, detail = "") {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
export function summary() {
  console.log(`\nPASS: ${pass}   FAIL: ${fail}`);
  if (fail) { console.log("Failures:"); failures.forEach((f) => console.log("  - " + f)); }
  return fail;
}

// Sign in through the real form; staging GoTrue can take ~10s.
export async function uiLogin(b, email, password, next) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await b.clearCookies();
    await b.goto("/login" + (next ? `?next=${encodeURIComponent(next)}` : ""));
    await b.fill("input[name=email]", email); await b.fill("input[name=password]", password);
    await b.click(/^sign in$/i, { selector: "button[type=submit]" });
    const ok = await b.waitUrl(/^(?!\/login)/, 45000);
    if (ok) { await b.idle(500); return b.url(); }
    const t = await b.text();
    if (!/couldn.t sign you in just now/i.test(t)) throw new Error("uiLogin: " + t.slice(0, 200).replace(/\n+/g, " | "));
    console.log(`  (sign-in transport failure, retry ${attempt})`); await sleep(3000 * attempt);
  }
  throw new Error("uiLogin: staging auth unreachable after 4 attempts");
}

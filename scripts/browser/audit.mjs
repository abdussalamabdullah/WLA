/**
 * RENDERED BROWSER AUDIT — accessibility, responsiveness and screenshots.
 *
 * Drives headless Chrome over CDP with no dependencies: Node's global
 * WebSocket plus `--remote-debugging-port`. It exists because in this codebase
 * every serious visual and accessibility defect has been found by looking at
 * the rendered page, never by reading the source — the typeface that never
 * loaded, the container overflow, the button label at 2.26:1, the child's name
 * printed twice.
 *
 * Usage:
 *   node scripts/browser/audit.mjs --cookies <file> [--child <uuid>]
 *        --pages /a,/b --out <dir> [--shot /a] [--viewports mobile,desktop]
 */
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") ? "true" : arr[i + 1]]);
    return acc;
  }, []),
);

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = Number(args.port ?? 9410);
const OUT = args.out ?? "/tmp/wla-lms/audit";
const BASE = args.base ?? "http://localhost:3000";
const PAGES = (args.pages ?? "/academy/my-missions").split(",");
const SHOTS = (args.shot ?? "").split(",").filter(Boolean);
const ALL_VIEWPORTS = {
  mobile: [390, 844, true],
  tablet: [834, 1112, false],
  desktop: [1512, 950, false],
};
const VIEWPORTS = (args.viewports ?? "mobile,tablet,desktop")
  .split(",")
  .map((n) => [n, ...ALL_VIEWPORTS[n]]);

mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu",
  "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${OUT}/profile`, "about:blank",
], { stdio: "ignore" });

let target;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    target = (await r.json()).find((t) => t.type === "page");
    if (target) break;
  } catch {}
  await sleep(250);
}
if (!target) { console.error("could not start Chrome"); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

if (args.cookies && existsSync(args.cookies)) {
  for (const c of JSON.parse(readFileSync(args.cookies, "utf8"))) {
    await send("Network.setCookie", { name: c.name, value: c.value, domain: "localhost", path: "/" });
  }
}
if (args.child) {
  await send("Network.setCookie", { name: "wla_active_child", value: args.child, domain: "localhost", path: "/" });
}
if (args.childSession) {
  await send("Network.setCookie", { name: "wla_child_session", value: args.childSession, domain: "localhost", path: "/" });
}

/** Wait for the streamed content, not a fixed guess — a fixed sleep races the
 *  Suspense boundary and reports "0 h1" on whichever viewport loses. */
/*
 * Returns FALSE if the page never finished rendering.
 *
 * Reporting a timeout as "0 h1" is how a slow dev-server compile came back
 * looking like a missing heading — the same page passing at one viewport and
 * failing at another is the tell. A timeout is a property of the harness, not
 * of the page, and must be labelled as one.
 */
async function settle(expectPath) {
  for (let t = 0; t < 50; t++) {
    const ready = (await send("Runtime.evaluate", {
      returnByValue: true,
      /*
       * Ready = the document is complete, an h1 exists, and <main> has real
       * content in it.
       *
       * An earlier version also required the string "Loading your missions…"
       * to be ABSENT. That text is the route's loading.tsx and stays in the
       * streamed document after hydration, so the condition could never become
       * true — every page burned the full settle budget and then reported
       * "0 h1" as though the heading were missing.
       */
      /*
       * The path is part of the condition. Without it, a poll can be answered
       * by the PREVIOUS page — the document is complete and has an h1, so
       * readiness looks satisfied while the new navigation is still in flight,
       * and the audit then measures the wrong page or waits out its whole
       * budget against a stale execution context.
       */
      expression: `(() => {
        if (!location.pathname.startsWith(${JSON.stringify(expectPath)})) return false;
        if (document.readyState !== 'complete') return false;
        if (document.querySelectorAll('h1').length === 0) return false;
        const m = document.querySelector('main');
        return !!m && (m.innerText || '').trim().length > 40;
      })()`,
    })).result.value;
    if (ready) { await sleep(300); return true; }
    await sleep(400);
  }
  return false;
}

const AUDIT = `(() => {
  const de = document.documentElement;
  const overflow = de.scrollWidth - de.clientWidth;

  const interactive = [...document.querySelectorAll(
    'a[href],button,select,input,textarea,[role=tab],[tabindex]:not([tabindex="-1"])')];

  const small = interactive.filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // WCAG 2.5.8 inline exception: a link inside a sentence is exempt.
    const cs = getComputedStyle(e);
    const inlineInText = e.tagName === 'A' && cs.display.startsWith('inline') &&
      e.parentElement &&
      e.parentElement.textContent.trim().length > e.textContent.trim().length + 8;
    if (inlineInText) return false;
    return r.height < 24 || r.width < 24;
  }).map((e) => {
    const r = e.getBoundingClientRect();
    return e.tagName + ':' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30) +
      ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
  });

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
  let skip = null, prev = 0;
  for (const l of headings) { if (prev && l > prev + 1) { skip = prev + '->' + l; break; } prev = l; }

  /*
   * Controls with no accessible name.
   *
   * FORM FIELDS ARE EXCLUDED: an <input> never has text content, and takes its
   * name from a <label for>, which the unlabelled check below handles.
   * Counting them here flagged every correctly-labelled field in the app.
   *
   * An img alt inside a link or button IS a name - a wordmark link wrapping
   * a described logo is named, and flagging it was wrong too.
   */
  const nameless = interactive.filter((e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName)) return false;
    const r = e.getBoundingClientRect();
    if (!r.width) return false;
    if ((e.textContent || '').trim()) return false;
    if (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title')) return false;
    if (e.querySelector('.sr-only')) return false;
    const img = e.querySelector('img,svg');
    if (img && (img.getAttribute('alt') || '').trim()) return false;
    if (img && img.tagName === 'svg' && img.querySelector('title')) return false;
    return true;
  }).map((e) => e.tagName + (e.className ? '.' + String(e.className).slice(0, 30) : ''));

  const unlabelled = [...document.querySelectorAll('input,select,textarea')].filter((e) => {
    if (e.type === 'hidden') return false;
    if (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby')) return false;
    return !(e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]'));
  }).map((e) => e.tagName + '#' + (e.id || '(no id)'));

  return {
    title: document.title,
    overflow, small, skip,
    h1: document.querySelectorAll('h1').length,
    nameless, unlabelled,
    headings: headings.join(','),
  };
})()`;

/*
 * Warm every route first. The dev server compiles a route on its first hit,
 * which can take longer than any sensible settle budget; measuring that is
 * measuring the bundler.
 */
for (const page of PAGES) {
  await send("Page.navigate", { url: `${BASE}${page}` });
  await settle(page);
}

const report = [];
for (const [name, w, h, mobile] of VIEWPORTS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: h, deviceScaleFactor: 2, mobile,
  });
  for (const page of PAGES) {
    await send("Page.navigate", { url: `${BASE}${page}` });
    const settled = await settle(page);
    const r = (await send("Runtime.evaluate", { returnByValue: true, expression: AUDIT })).result.value;
    report.push({ viewport: name, page, settled, ...r });

    if (SHOTS.includes(page) && name === (args.shotViewport ?? "desktop")) {
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      const file = `${OUT}/${page.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}-${name}.png`;
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`     shot: ${file}`);
    }
  }
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));

let failed = 0;
for (const r of report) {
  const issues = [];
  if (!r.settled) issues.push("TIMED OUT (harness, not the page)");
  if (r.overflow > 0) issues.push(`H-SCROLL ${r.overflow}px`);
  if (r.small.length) issues.push(`${r.small.length} target(s) under 24px`);
  if (r.skip) issues.push(`heading skip ${r.skip}`);
  if (r.settled && r.h1 !== 1) issues.push(`${r.h1} h1`);
  if (r.nameless.length) issues.push(`${r.nameless.length} unnamed control(s)`);
  if (r.unlabelled.length) issues.push(`${r.unlabelled.length} unlabelled field(s)`);
  if (issues.length) failed++;
  console.log(`${issues.length ? "FAIL" : "PASS"}  ${r.viewport.padEnd(8)} ${r.page.padEnd(42)} ${issues.join(", ") || "ok"}`);
  for (const s of r.small.slice(0, 3)) console.log(`         small: ${s}`);
  for (const s of r.nameless.slice(0, 3)) console.log(`         unnamed: ${s}`);
  for (const s of r.unlabelled.slice(0, 3)) console.log(`         unlabelled: ${s}`);
}
console.log(`\n${report.length - failed}/${report.length} page-viewport combinations clean`);

ws.close();
chrome.kill();
process.exit(failed ? 1 : 0);

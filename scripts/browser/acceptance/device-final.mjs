// FINAL QA — device paths and their fallbacks in Chrome's emulation.
// A. Builder: tilt and motion screens added through the forms to a QA draft,
//    then played in Learner Preview — tilt from Chrome's device-orientation
//    emulation; motion from Chrome's sensor override if it reaches
//    `devicemotion` (otherwise: Hardware QA Required, not faked).
// B. Learner on the mechanics mission: camera permission denied, no
//    BarcodeDetector, no orientation sensor — each lands on the typed/manual
//    route and is reported structurally.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep, BASE } from "./cdp.mjs";
import { forms } from "./forms-lib.mjs";
import { readFileSync } from "node:fs";

const { slug: FSLUG } = JSON.parse(readFileSync("/tmp/wla-qa/final-mission.json", "utf8"));
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (p, init = {}) => (await fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })).json();
const main = (b) => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async (b) => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(800); };
const readingOf = (b) => b.eval("(document.querySelector('main [aria-live=polite].tabular-nums')||{}).innerText||''");

console.log("\n--- A. tilt and motion in Learner Preview ---");
const A = await launch({ port: 9602 });
await A.viewport(1512, 950);
const f = forms(A);
await uiLogin(A, ...ACCOUNTS.admin);
const draft = `/admin/builder/${FSLUG}/3`;
async function deviceScreen(key, seq, mode, prompt, min, max, next) {
  await A.goto(draft, 1000);
  if (new RegExp(`\\b${key} ·`).test(await main(A))) return true;
  await A.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
  await A.fill("#screen_key", key); await A.fill("#sequence", String(seq));
  await A.fill("#type", "device_input"); await sleep(400);
  await A.fill("#title", prompt); await A.fill("#body", "");
  const S = { legend: "device input settings" };
  await f.set(S, "Prompt", prompt);
  await f.set(S, "Mode", mode);
  await f.set({ legend: "Outcome 1" }, "Id", "ok");
  await f.set({ legend: "Outcome 1" }, "Min", String(min));
  await f.set({ legend: "Outcome 1" }, "Max", String(max));
  await f.set({ legend: "Outcome 1" }, "Goes to", next);
  await f.set(S, "Goes to", next);
  await A.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle(A);
  await A.goto(draft, 1000);
  return new RegExp(`\\b${key} ·`).test(await main(A)) || (await main(A)).slice(0, 200);
}
const t1 = await deviceScreen("tilt", 1, "tilt", "Hold the device flat.", -10, 10, "shake");
chk("builder: a tilt screen added through the forms", t1 === true, String(t1));
const t2 = await deviceScreen("shake", 2, "motion", "Shake the device three times.", 3, 100, "intro");
chk("builder: a motion screen added through the forms", t2 === true, String(t2));

await A.viewport(390, 844, true);
await A.goto(`${draft}/preview`, 1500);
if (!/Hold the device flat/.test(await main(A))) { await A.click(/^start again$/i, { selector: "button" }).catch(() => {}); await sleep(800); }
chk("preview opens on the tilt screen", await A.waitText(/Hold the device flat/, 20000));
await A.send("DeviceOrientation.setDeviceOrientationOverride", { alpha: 0, beta: 40, gamma: 0 });
await A.click(/^use the tilt sensor$/i, { selector: "main button" }); await sleep(1200);
const r40 = await readingOf(A);
await A.send("DeviceOrientation.setDeviceOrientationOverride", { alpha: 0, beta: 3, gamma: 0 }); await sleep(1000);
const r3 = await readingOf(A);
chk("tilt follows the emulated orientation feed (40° → 3°)", /40/.test(r40) && /\b3\b/.test(r3), `${r40} → ${r3}`);
await A.click(/^use this$/i, { selector: "main button" }); await settle(A);
chk("the level reading takes the tilt outcome to the next screen", await A.waitText(/Shake the device three times/, 20000));

let motionReached = false;
try {
  await A.send("Emulation.setSensorOverrideEnabled", { enabled: true, type: "accelerometer" });
  await A.send("Emulation.setSensorOverrideEnabled", { enabled: true, type: "linear-acceleration" });
  await A.send("Emulation.setSensorOverrideEnabled", { enabled: true, type: "gyroscope" });
  await A.eval("window.__dm=0; addEventListener('devicemotion',()=>window.__dm++)");
  await A.click(/^count my shakes$/i, { selector: "main button" }); await sleep(500);
  for (let i = 0; i < 8; i++) {
    const x = i % 2 ? 30 : -30;
    await A.send("Emulation.setSensorOverrideReadings", { type: "accelerometer", reading: { xyz: { x, y: 0, z: 9.8 } } });
    await A.send("Emulation.setSensorOverrideReadings", { type: "linear-acceleration", reading: { xyz: { x, y: 0, z: 0 } } });
    await sleep(500);
  }
  const dm = await A.eval("window.__dm");
  const shakes = await readingOf(A);
  console.log(`  devicemotion events: ${dm}; reading: ${JSON.stringify(shakes)}`);
  motionReached = dm > 0 && /[3-9]/.test(shakes);
} catch (e) { console.log("  sensor override unavailable:", e.message); }
console.log(`  MOTION RESULT: ${motionReached ? "VERIFIED via sensor override" : "HARDWARE QA REQUIRED"}`);
if (!(await A.has(/^use this$/i, "main button"))) await A.click(/do it without the sensor/i, { selector: "main button" });
if (!motionReached) {
  await A.click(/do it without the sensor/i, { selector: "main button" }).catch(() => {}); await sleep(300);
  const manual = await A.eval("(()=>{const i=document.querySelector('main input'); return i? (i.labels?.[0]?.innerText||i.getAttribute('aria-label')||'') : [...document.querySelectorAll('main [role=radio]')].length})()");
  chk("motion has a manual route that needs no sensor", Boolean(manual), String(manual));
}
await A.close?.();

console.log("\n--- B. fallbacks on the mechanics mission ---");
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const SLUG = "qa-mechanics-mission";
const mission = (await svc(`missions?slug=eq.${SLUG}&select=id`))[0];
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: `QA Fallback ${Date.now().toString(36).slice(-4)}`, birth_year: 2015 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: mission.id, source: "admin", status: "active" }) });
const b = await launch({ port: 9603, args: ["--use-fake-device-for-media-stream"] });
await b.viewport(390, 844, true);
await b.send("Browser.setPermission", { permission: { name: "camera" }, setting: "denied", origin: BASE });
await uiLogin(b, q.email, q.password);
await b.cookies([{ name: "wla_active_child", value: kid.id }]);
await b.goto(`/academy/missions/${SLUG}`, 1000);
await b.click(/^start mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000);
await b.waitText(/Before you start/, 20000);
for (let i = 0; i < 40 && !(await b.has(/^continue$/i, "main button")); i++) await sleep(500);
console.log("  first screen:", (await main(b)).slice(0, 200).replace(/\n+/g, " | "));
await b.click(/^continue$/i, { selector: "main button" }); await settle(b);
await b.waitText(/Which way is the tower/, 90000);
await b.eval("delete window.DeviceOrientationEvent");
await b.click(/^use the compass$/i, { selector: "main button" }); await sleep(800);
chk("no orientation sensor: the child is told plainly and given the manual route", /doesn.t have that sensor/.test(await main(b)) && (await b.eval("document.querySelectorAll('main [role=radio]').length")) >= 4, (await main(b)).slice(0, 200).replace(/\n+/g, " | "));
await b.click(/^east$/i, { selector: "main [role=radio]" });
await b.click(/^use this$/i, { selector: "main button" }); await settle(b);
await b.waitText(/What code is on your card/, 20000);
await b.click(/scan it with the camera/i, { selector: "main button" }); await sleep(2000);
const denied = await main(b);
chk("camera permission denied: no camera feed, told to type it instead", /type it in instead|type it/i.test(denied) && !(await b.eval("!!document.querySelector('main video')?.srcObject")), denied.slice(0, 260).replace(/\n+/g, " | "));
if (await b.has(/stop the camera/i, "main button")) await b.click(/stop the camera/i, { selector: "main button" });
await b.eval("delete window.BarcodeDetector");
if (await b.has(/scan it with the camera/i, "main button")) { await b.click(/scan it with the camera/i, { selector: "main button" }); await sleep(1200); }
chk("no BarcodeDetector: the typed route is offered", /type it in instead|type it/i.test(await main(b)), (await main(b)).slice(0, 200).replace(/\n+/g, " | "));
await b.fill("main input", "river-7"); await b.click(/^check$/i, { selector: "main button" });
chk("the mission completes by the typed route", await b.waitUrl(/\/complete/, 40000));
const prog = (await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${mission.id}&select=id`))[0];
const ev = await svc(`analytics_events?mission_id=eq.${mission.id}&name=eq.device_fallback_used&occurred_at=gte.${new Date(Date.now() - 15 * 60000).toISOString()}&select=detail`);
const sources = [...new Set((Array.isArray(ev) ? ev : []).map((e) => e.detail?.source))];
console.log("  fallback sources reported:", JSON.stringify(sources));
chk("fallbacks are reported structurally (compass unavailable, camera denied/unavailable)", sources.includes("compass_unavailable") && sources.some((s) => /^camera_(denied|unavailable)$/.test(s)), JSON.stringify(sources));
chk("no camera image was stored anywhere for this run", !(await svc(`mission_evidence?progress_id=eq.${prog.id}&select=id`)).length);
await b.close?.();
summary(); process.exit(0);

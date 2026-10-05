// Device mechanics with REAL browser input (Plan §5): the compass driven by a
// device-orientation sensor feed, and camera scanning reading a QR code from a
// camera feed with the browser's own BarcodeDetector — in Chrome's emulated
// sensor and fake-camera environment, on the published mechanics mission.
import { launch, chk, summary, uiLogin, sleep } from "./cdp.mjs";
import { readFileSync, existsSync } from "node:fs";
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const H = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const svc = async (p, init = {}) => (await fetch(`${SB}/rest/v1/${p}`, { headers: H, ...init })).json();
const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
if (!existsSync("/tmp/wla-qa/qr-camera.y4m")) throw new Error("make the QR camera feed first");
const SLUG = "qa-mechanics-mission";
const mission = (await svc(`missions?slug=eq.${SLUG}&select=id`))[0];
const parent = (await svc(`profiles?select=id&email=eq.${encodeURIComponent(q.email)}`))[0];
const kid = (await svc("child_profiles", { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ parent_id: parent.id, display_name: `QA Device ${Date.now().toString(36).slice(-4)}`, birth_year: 2014 }) }))[0];
await fetch(`${SB}/rest/v1/mission_entitlements`, { method: "POST", headers: H, body: JSON.stringify({ child_id: kid.id, mission_id: mission.id, source: "admin", status: "active" }) });

const b = await launch({ port: 9579, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=/tmp/wla-qa/qr-camera.y4m"] });
await b.viewport(390, 844, true);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(700); };
await uiLogin(b, q.email, q.password);
await b.cookies([{ name: "wla_active_child", value: kid.id }]);
await b.goto(`/academy/missions/${SLUG}`, 1000);
await b.click(/^start mission/i, { selector: "main button, main a" }); await b.waitUrl(/\/active/, 40000);
await b.waitText(/Before you start/, 20000);
await b.click(/^continue$/i, { selector: "main button" }); await settle();
await b.waitText(/Wait at the gate/, 20000);
chk("the timed stage moves on by itself (server time)", await b.waitText(/Which way is the tower/, 60000));

// Compass: a real deviceorientation feed facing east (alpha 270 → heading 90).
await b.send("DeviceOrientation.setDeviceOrientationOverride", { alpha: 270, beta: 0, gamma: 0 });
await b.click(/^use the compass$/i, { selector: "main button" }); await sleep(1200);
const reading = await b.eval("(document.querySelector('main [aria-live=polite].tabular-nums')||{}).innerText||''");
chk("the compass reads the device's heading and says it in words", /90°.*East/.test(reading), reading);
await b.click(/^use this$/i, { selector: "main button" }); await settle();
const st = (await svc(`mission_state?progress_id=eq.${(await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${mission.id}&select=id`))[0].id}&select=state_data`))[0].state_data;
chk("the server graded the SENSOR reading (east)", st.outcomes?.dir === "east", JSON.stringify(st.outcomes));
const resp = await svc(`mission_responses?select=value&screen_key=eq.dir&progress_id=eq.${(await svc(`mission_progress?child_id=eq.${kid.id}&mission_id=eq.${mission.id}&select=id`))[0].id}`);
chk("the stored reading came from the sensor, as a number only", JSON.stringify(resp[0]?.value).includes('"source":"sensor"') || resp[0]?.value?.value?.source === "sensor", JSON.stringify(resp[0]?.value));

// Camera: the fake camera shows a QR code reading RIVER-7.
await b.waitText(/What code is on your card/, 20000);
const before = b.events.length;
await b.click(/^scan it with the camera$/i, { selector: "main button" });
chk("the camera view is object-facing and says so", await b.waitText(/Point the camera at the code on the card — just the card, not people or faces/, 10000));
for (let i = 0; i < 40 && !(await b.eval("(document.querySelector('main input')||{}).value")); i++) await sleep(250);
const filled = await b.eval("document.querySelector('main input').value");
chk("the code is read from the camera into the field", filled === "RIVER-7", filled);
chk("the camera stops as soon as the code is read", await b.eval("[...document.querySelectorAll('main video')].every(v=>!v.srcObject || v.srcObject.getTracks().every(t=>t.readyState==='ended'))"));
const uploads = b.events.slice(before).filter((e) => e.method === "Network.requestWillBeSent" && ["POST", "PUT"].includes(e.params.request.method) && /storage|upload/.test(e.params.request.url));
chk("no camera image is sent anywhere", uploads.length === 0, JSON.stringify(uploads.map((u) => u.params.request.url)));
await b.click(/^check$/i, { selector: "main button" });
chk("the scanned code completes the mission", await b.waitUrl(/\/complete/, 40000));
await b.close?.();
summary();

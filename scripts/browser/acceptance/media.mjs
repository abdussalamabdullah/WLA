// F7 media: upload assets in the builder, use them on screens, see them in
// Learner Preview (signed, accessible), at 390 / 834 / 1512.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";

const SLUG = "qa-library-mission";
const builder = `/admin/builder/${SLUG}/1`;
const b = await launch({ port: 9452 });
await b.viewport(1512, 950);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 160; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(600); };
const F = "section[aria-labelledby=media-assets] details form";

async function addAsset({ key, kind, file, alt, transcript }) {
  await b.goto(builder, 800);
  if (new RegExp(`\\b${key} · ${kind}`).test(await main())) { chk(`asset "${key}" present`, true); return; }
  await b.eval(`document.querySelector(${JSON.stringify(F)}).closest('details').open = true`);
  await b.fill(`${F} input[name=key]`, key);
  await b.fill(`${F} select[name=kind]`, kind); await sleep(200);
  await b.setFile(`${F} input[name=file]`, file);
  if (alt) await b.fill(`${F} input[name=alt_text]`, alt);
  if (transcript) await b.fill(`${F} textarea[name=transcript]`, transcript);
  await b.eval(`[...document.querySelectorAll(${JSON.stringify(F + " button[type=submit]")})][0].click()`);
  await settle();
  chk(`builder: upload ${kind} "${key}"`, /Media saved\./.test(await main()), (await main()).match(/Media[\s\S]{0,400}/)?.[0]?.replace(/\n+/g, " | "));
}

async function addScreen(key, type, config, seq) {
  await b.goto(builder, 800);
  if (new RegExp(`\\b${key} ·`).test(await main())) return;
  await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
  await b.fill("#screen_key", key); await b.fill("#sequence", String(seq));
  await b.fill("#type", type); await sleep(250);
  await b.fill("#title", type === "content" ? "What the bridge looked like" : ""); await b.fill("#body", "");
  await b.fill("#configuration-json", JSON.stringify(config, null, 2));
  await b.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle();
  chk(`builder: add ${type} screen "${key}" using media`, /Screen saved\./.test(await main()), (await main()).slice(0, 300));
}

await uiLogin(b, ...ACCOUNTS.admin);
console.log("\n--- A. Assets in the builder ---");
// Server-side checks first: an image without a text alternative is refused.
await b.goto(builder, 800);
await b.eval(`document.querySelector(${JSON.stringify(F)}).closest('details').open = true`);
await b.fill(`${F} input[name=key]`, "no_alt"); await b.setFile(`${F} input[name=file]`, "/tmp/wla-qa/bridge-before.png");
await b.eval(`[...document.querySelectorAll(${JSON.stringify(F + " button[type=submit]")})][0].click()`); await settle();
chk("an image without a text alternative is refused at upload", /Describe what the picture shows/.test(await main()));

await addAsset({ key: "bridge", kind: "image", file: "/tmp/wla-qa/bridge-before.png", alt: "The bridge before the flood: a stone arch over a calm stream." });
await addAsset({ key: "bridge_after", kind: "image", file: "/tmp/wla-qa/bridge-after.png", alt: "The bridge after the flood: the arch cracked and the bank washed away." });
await addAsset({ key: "river", kind: "audio", file: "/tmp/wla-qa/tone.wav", transcript: "The river is loud today.\n\nYou can hear water rushing under the arch." });
await b.goto(builder, 800);
chk("the asset list shows text alternatives and transcripts", /Text alternative: The bridge before/.test(await main()) && /Transcript/.test(await main()));

await addScreen("media", "content", {
  next: "spot2",
  media: [
    { asset: "bridge", display: "zoom", caption: "Drawn the week before." },
    { asset: "bridge", display: "before_after", compareWith: "bridge_after", labels: ["Before the flood", "After the flood"] },
    { asset: "river", caption: "Recorded at the bank." },
  ],
}, 1);
await addScreen("spot2", "hotspot", {
  next: "num", prompt: "Where did the water get in?",
  image: { src: "asset:bridge_after", alt: "The damaged bridge." },
  regions: [{ id: "arch", label: "The arch", x: 30, y: 20, w: 40, h: 40 }, { id: "bank", label: "The bank", x: 0, y: 70, w: 100, h: 30 }],
}, 2);
await b.goto(builder, 800);
const qa = await main();
chk("mission QA: no missing media or text alternatives", !/missing_asset|which is not in this version.s assets|needs a text alternative|needs a text equivalent/i.test(qa), qa.match(/Must fix[\s\S]{0,300}/)?.[0]);

console.log("\n--- B. Learner Preview ---");
await b.goto(`${builder}/preview`, 1200);
await b.waitText(/What the bridge looked like/, 8000);
for (const [w, h] of [[390, 844], [834, 1112], [1512, 950]]) {
  await b.viewport(w, h); await sleep(300);
  const a = await b.audit();
  const nameless = await b.eval("[...document.querySelectorAll('main button,main a[href],main [role=radio]')].filter(e=>!e.closest('details:not([open])') && e.getBoundingClientRect().width>0 && !(e.innerText||'').trim() && !e.getAttribute('aria-label')).length");
  chk(`media @${w}: no overflow, small targets, unlabelled controls or heading skips`, a.overflow <= 0 && !a.small.length && !a.unlabelled.length && !a.skip.length && nameless === 0, JSON.stringify({ o: a.overflow, s: a.small, u: a.unlabelled, k: a.skip, nameless }));
  if (w === 390) await b.shot("media-390");
}
const imgs = await b.eval("[...document.querySelectorAll('main figure img')].map(i=>({src:i.src, alt:i.alt, ok:i.complete && i.naturalWidth>0}))");
chk("pictures load from short-lived signed URLs", imgs.length >= 2 && imgs.every((i) => /\/storage\/v1\/object\/sign\/mission-media\//.test(i.src) && /token=/.test(i.src)), JSON.stringify(imgs.map((i) => i.src.slice(0, 90))));
chk("every picture loads and has its text alternative", imgs.every((i) => i.ok && i.alt.length > 10), JSON.stringify(imgs.map((i) => [i.ok, i.alt])));
chk("captions are shown", /Drawn the week before\./.test(await main()) && /Recorded at the bank\./.test(await main()));

await b.click(/^see it larger$/i, { selector: "main button" }); await sleep(400);
chk("zoom opens the picture larger in a dialog", await b.eval("!!document.querySelector('[role=dialog] img') && document.querySelector('[role=dialog] img').alt.length > 10"));
await b.click(/^back to the mission$/i, { selector: "[role=dialog] button" }); await sleep(300);
chk("the dialog closes back to the mission", !(await b.eval("!!document.querySelector('[role=dialog]')")));

const beforeSrc = await b.eval("[...document.querySelectorAll('main figure')][1].querySelector('img').src");
await b.click(/after the flood/i, { selector: "main [role=radio]" }); await sleep(300);
const afterSrc = await b.eval("[...document.querySelectorAll('main figure')][1].querySelector('img').src");
chk("before/after switches by a named choice, not a precision slider", beforeSrc !== afterSrc && /bridge-after|after/.test(await b.eval("[...document.querySelectorAll('main figure')][1].querySelector('img').alt")), `${beforeSrc.slice(-40)} → ${afterSrc.slice(-40)}`);
chk("before/after announces which is shown", /Showing After the flood/.test(await b.eval("document.querySelector('main').innerText + [...document.querySelectorAll('main .sr-only')].map(x=>x.textContent).join(' ')")));

chk("audio has visible controls and does not autoplay", await b.eval("(()=>{const a=document.querySelector('main audio'); return !!a && a.controls && !a.autoplay && /mission-media/.test(a.src);})()"));
await b.click(/^read the transcript$/i, { selector: "main summary" }); await sleep(200);
chk("audio has its transcript", /water rushing under the arch/.test(await main()));

await b.click(/^continue$/i, { selector: "main button" });
await b.waitText(/Where did the water get in/, 8000);
chk("an asset: image source resolves to a signed URL in an interaction", await b.eval("/\\/sign\\/mission-media\\//.test(document.querySelector('main figure img').src) && document.querySelector('main figure img').complete && document.querySelector('main figure img').naturalWidth > 0"));

await b.close?.();
summary();

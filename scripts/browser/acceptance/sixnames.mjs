// Six Names v2 — all six branches, played by real child sessions in the real app.
import { launch, chk, summary, uiLogin, sleep } from "./cdp.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const q = JSON.parse(readFileSync("qa-parent.json", "utf8"));
const { kids } = JSON.parse(readFileSync("qa-kids.json", "utf8"));
const ONLY = process.env.ONLY; // e.g. "QA Ask Pause"

const D1 = { ask: "Ask about the list", stop: "Stop the claim spreading" };
const D2 = { pause: "Ask everyone to pause", share: "Continue, but share the role", away: "Suggest Noor steps away" };
const C1 = { ask: "office assistant says the head teacher", stop: "Some pupils agree not to repeat the claim" };
const C2 = { pause: "Some agree that the list proves nothing", share: "Noor stays involved, but another pupil shares", away: "Noor steps away from the project role" };
const T1 = { ask: "Some support", stop: "Clearly supported" };
const T2SUPPORT = { pause: "Clearly supported", share: "Some support", away: "Alone" };
const EVIDENCE = "team-equipment records";
const SKIP = (process.env.SKIP ?? "").split(",").filter(Boolean);
const PLANS = [
  ["QA Ask Pause", "ask", "pause"], ["QA Ask Share", "ask", "share"], ["QA Ask Away", "ask", "away"],
  ["QA Stop Pause", "stop", "pause"], ["QA Stop Share", "stop", "share"], ["QA Stop Away", "stop", "away"],
].filter(([n]) => (!ONLY || n === ONLY) && !SKIP.includes(n));

const b = await launch({ port: 9430 });
await b.viewport(1512, 950);
const html = () => b.eval("document.documentElement.outerHTML");
const mainText = () => b.eval("(document.querySelector('main')||document.body).innerText");
const results = {};
const env = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
const SB = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(env)[1].trim(), SK = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)[1].trim();
const svc = async (path) => (await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
async function dbTracker(childId) {
  const p = await svc(`mission_progress?child_id=eq.${childId}&select=id,mission_version,status,current_screen_key`);
  const st = p[0] ? await svc(`mission_state?progress_id=eq.${p[0].id}&select=state_data`) : [];
  return st[0]?.state_data?.custom?.tracker ?? null;
}

async function waitSettled() {
  // wait for any pending primary action to settle (buttons re-enabled, no "…" label)
  for (let i = 0; i < 240; i++) {
    const busy = await b.eval("[...document.querySelectorAll('main button')].some(x => /…$/.test(x.innerText.trim()) || x.getAttribute('aria-busy')==='true')").catch(() => true);
    if (!busy) break;
    await sleep(250);
  }
  await sleep(400);
}
async function clickMain(re) {
  try { await b.click(re, { selector: "main button, main a" }); }
  catch (e) {
    const dump = await b.eval("(document.querySelector('main h2')||{}).innerText + ' || ' + [...document.querySelectorAll('main button')].map(x=>x.innerText.trim().replace(/\\n/g,' ')+(x.disabled?'[D]':'')+(x.getAttribute('aria-pressed')==='true'?'[P]':'')).join(' | ')");
    throw new Error(`${e.message} ON ${dump}`);
  }
  await waitSettled();
}
async function screenTitle() { return b.eval("(document.querySelector('main h2')||{}).innerText || ''"); }

// Generate a code for a child through the parent UI.
async function codeFor(childId) {
  await uiLogin(b, q.email, q.password);
  await b.goto(`/account/children/${childId}`, 800);
  await b.click(/^(create a code|make a new code)$/i, { selector: "button" });
  await b.waitText(/new code\. Write it down/i, 30000);
  const code = await b.eval("(document.body.innerText.match(/\\b[A-Z0-9]{4}-[A-Z0-9]{4}\\b/)||[])[0]");
  return code;
}

async function childLogin(code) {
  await b.clearCookies();
  await b.goto("/child/login", 400);
  await b.fill("input[name=code]", code);
  await b.click(/continue|sign in|enter/i, { selector: "button[type=submit]" });
  return b.waitUrl(/\/academy/, 40000);
}

for (const [name, d1, d2] of PLANS) {
  console.log(`\n=========== ${name}: ${d1} → ${d2} ===========`);
  // SUFFIX selects a fresh set of branch children (each child has one run; no replay).
  const kid = kids.find((k) => k.display_name === name + (process.env.SUFFIX ?? ""));
  const code = await codeFor(kid.id);
  chk(`${name}: parent generated a code in the UI`, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code || ""), String(code));
  chk(`${name}: child signs in with the code`, await childLogin(code));
  await b.goto("/academy/my-missions", 600);
  const mm = await mainText();
  chk(`${name}: child sees only their own missions (Six Names, no switcher/account)`,
    /six names/i.test(mm) && !(await b.eval("/Account|Choose a child|Log out of|Purchase|Get this mission/.test(document.querySelector('header')?.innerText||'')")),
    (await b.eval("document.querySelector('header')?.innerText||''")).replace(/\n+/g, " | "));
  await b.goto("/academy/missions/six-names", 600);
  chk(`${name}: Mission Home offers Start/Continue Mission`, /(start|continue) mission/i.test(await mainText()));
  await clickMain(/^(start|continue) mission/i);
  await b.waitUrl(/\/active/, 40000); await b.goto("/academy/missions/six-names/active", 600);

  const seen = []; let pausedChecked = false, mcChecked = false, evidenceHiddenChecked = false, changedAfterTracker = null;
  let lastTracker1 = false, textFieldSeen = false, judged = false, sortResumed = null;
  for (let step = 0; step < 45; step++) {
    const t = await screenTitle(); const body = await mainText(); const h = await html();
    seen.push(t);
    if (process.env.TRACE) console.log(`   step ${step}: [${t}] ${await b.url()} | ${(await b.eval("[...document.querySelectorAll('main button')].map(x=>x.innerText.trim().replace(/\\n/g,' / ')).join(' | ')")).slice(0, 400)}`);
    if (/\/complete/.test(await b.url())) break;
    // Six Names collects no written reflection anywhere (Build Brief).
    if (await b.eval("!!document.querySelector('main textarea, main input[type=text]')")) textFieldSeen = true;

    // Branch protection: the unused consequences' text must not be anywhere in the page payload.
    for (const [k, txt] of Object.entries(C1)) if (k !== d1 && h.includes(txt)) chk(`${name}: unused D1 consequence "${k}" never reaches the page`, false, t);
    for (const [k, txt] of Object.entries(C2)) if (k !== d2 && h.includes(txt)) chk(`${name}: unused D2 consequence "${k}" never reaches the page`, false, t);

    if (/Decision 1/.test(t) && !seen.includes("__d1")) {
      chk(`${name}: Evidence not in page before its stage (at Decision 1)`, !h.includes(EVIDENCE)); evidenceHiddenChecked = true;
      await b.click(D1[d1], { selector: "main button" }); await clickMain(/^confirm response$/i); seen.push("__d1"); continue;
    }
    if (/Decision 2/.test(t) && !seen.includes("__d2")) { await b.click(D2[d2], { selector: "main button" }); await clickMain(/^confirm response$/i); seen.push("__d2"); continue; }
    if (/What do you stand by/.test(t)) {
      chk(`${name}: Judgement offers its cards without marking any right or wrong`, !/\b(correct|incorrect|wrong|right answer)\b/i.test(body));
      await b.click("I stand by both decisions.", { selector: "main button" }); await clickMain(/^confirm$/i); judged = true; continue;
    }
    if (/What happened$/.test(t)) {
      chk(`${name}: consequence 1 is the ${d1} one`, body.includes(C1[d1]));
      // Mission Control opens and closes without advancing (configured here)
        if (!mcChecked) {
          const hasMc = await b.eval("[...document.querySelectorAll('button')].some(x=>/mission control/i.test(x.innerText))");
          chk(`${name}: Mission Control is offered on the tracker screen`, hasMc);
          await b.eval("[...document.querySelectorAll('button')].find(x=>/mission control/i.test(x.innerText)).click()"); await sleep(800);
          const mcText = await b.text();
          chk(`${name}: Mission Control opens (dialog)`, await b.eval("!!document.querySelector('[role=dialog], dialog[open]')"), mcText.slice(-200));
          chk(`${name}: Mission Control does not reveal Evidence`, !(await html()).includes(EVIDENCE));
          await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
          await sleep(400);
          if (await b.eval("!!document.querySelector('[role=dialog], dialog[open]')")) await b.click(/close|back to the mission/i, { selector: "[role=dialog] button, dialog button" });
          await sleep(300);
          chk(`${name}: Mission Control did not advance the mission`, (await screenTitle()) === t);
          mcChecked = true;
        }
    }
    if (/What happened next/.test(t)) chk(`${name}: consequence 2 is the ${d2} one`, body.includes(C2[d2]));
    if (/What the Academy has/.test(t)) {
      if (!lastTracker1) {
        chk(`${name}: tracker after D1 shows Support = ${T1[d1]}`, body.includes(T1[d1]) && /Groups/.test(body), body.slice(0, 200).replace(/\n+/g, " | "));
        lastTracker1 = true;
        // pause/resume here: leave, come back, same screen and same values
        if (!pausedChecked) {
          await b.goto("/academy/my-missions", 400);
          chk(`${name}: collection shows In progress / Continue after leaving`, /continue mission/i.test(await mainText()));
          await b.goto("/academy/missions/six-names/active", 600);
          const t2 = await screenTitle(), b2 = await mainText();
          chk(`${name}: resume returns to the exact screen and tracker`, t2 === t && b2.includes(T1[d1]), `${t2}`);
          pausedChecked = true;
        }
      } else {
        chk(`${name}: tracker after D2 shows Support = ${T2SUPPORT[d2]}, Spread = Nearly everyone`, body.includes(T2SUPPORT[d2]) && body.includes("Nearly everyone"));
      }
      await clickMain(/^continue/i); if (changedAfterTracker === null) changedAfterTracker = /changed/i.test(await screenTitle()); continue;
    }
    if (/^Evidence/.test(t)) {
      chk(`${name}: Evidence body hidden until opened`, !h.includes(EVIDENCE));
      await clickMain(/^open evidence$/i);
      chk(`${name}: Evidence is SHOWN after the child opens it (same screen)`, (await mainText()).includes(EVIDENCE) && /^Evidence/.test(await screenTitle()), await screenTitle());
      const trk = await dbTracker(kid.id);
      chk(`${name}: Evidence changed only Clarity (→ Purpose clear)`, trk?.clarity === "Purpose clear" && trk?.support === T2SUPPORT[d2] && trk?.spread === "Nearly everyone", JSON.stringify(trk));
      await clickMain(/^continue$/i);
      for (let i = 0; i < 120 && /^Evidence/.test(await screenTitle()); i++) await sleep(250);
      continue;
    }
    if (/Final Judgement/.test(t)) {
      chk(`${name}: Final Judgement stays physical (no answer field)`, !(await b.eval("!!document.querySelector('main textarea, main input:not([type=hidden])')")));
      await clickMain(/^complete mission$/i); await b.waitUrl(/\/complete/, 40000); break;
    }
    // sort screen: pick a category for every item
    if (/actually know/.test(t)) {
      for (let i = 0; i < 12; i++) {
        await b.eval("(()=>{const g=document.querySelector('main [role=group]'); const x=g&&g.querySelector('button'); if(x && x.getAttribute('aria-pressed')!=='true') x.click();})()");
        await sleep(200);
        if (await b.has(/^(next|continue)$/i, "main button")) {
          await b.click(/^(next|continue)$/i, { selector: "main button" }); await sleep(300); await waitSettled();
          if (!/actually know/.test(await screenTitle())) break;
          // Interruption (D-100): reload mid-sort; the child is on the same item.
          if (sortResumed === null) {
            const before = (await mainText()).split("\n").slice(0, 6).join("|");
            await b.goto("/academy/missions/six-names/active", 600); await sleep(800);
            const after = (await mainText()).split("\n").slice(0, 6).join("|");
            sortResumed = before === after;
            chk(`${name}: a reload mid-sort returns to the same item`, sortResumed, `${before} ≠ ${after}`);
          }
          continue;
        }
        break;
      }
      continue;
    }
    // any other screen: its single primary action
    const primary = /^(continue to changed list|continue to decision 1|continue to decision 2|continue to judgement|check academy confirmation|continue)$/i;
    if (!(await b.has(primary, "main button"))) {
      // reflection may need a choice/text before Continue
      await b.eval("const ta=document.querySelector('main textarea'); if(ta){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta,'QA reflection'); ta.dispatchEvent(new Event('input',{bubbles:true}))}");
      await b.eval("(()=>{const x=document.querySelector('main button[aria-pressed]'); if(x){x.click(); return true} return false})()");
      await sleep(300);
      if (!(await b.has(primary, "main button"))) { chk(`${name}: no way forward on "${t}"`, false, body.slice(0, 200)); break; }
    }
    await clickMain(primary);
  }
  chk(`${name}: Changed List follows the first tracker`, changedAfterTracker === true);
  chk(`${name}: evidence-hidden check ran`, evidenceHiddenChecked);
  const url = await b.url();
  chk(`${name}: completion reached (/complete)`, /\/complete/.test(url), url);
  const comp = await mainText();
  chk(`${name}: completion is closure — no score/badge/confetti`, !/score|badge|points|confetti|congratulations!{2}/i.test(comp), comp.slice(0, 200).replace(/\n+/g, " | "));
  await b.goto("/academy/missions/six-names/trail", 800);
  const trail = await mainText();
  chk(`${name}: Trail shows entries for the run`, !/nothing here yet|no entries yet/i.test(trail) && trail.length > 80, trail.slice(0, 300).replace(/\n+/g, " | "));
  await b.goto("/academy/missions/six-names", 600);
  chk(`${name}: Mission Home now says View Mission`, /view mission/i.test(await mainText()) && !/continue mission/i.test(await mainText()));
  const prog = await svc(`mission_progress?child_id=eq.${kid.id}&select=id,mission_version,status`);
  chk(`${name}: run pinned to Six Names v2 and complete (D-17)`, prog[0]?.mission_version === 2 && prog[0]?.status === "complete", JSON.stringify(prog));
  const sd = (await svc(`mission_state?progress_id=eq.${prog[0]?.id}&select=state_data`))[0]?.state_data;
  chk(`${name}: stored choices are exactly the path played`, sd?.choices?.decision1 === { ask: "ask_about_list", stop: "stop_claim_spreading" }[d1] && sd?.choices?.decision2 === { pause: "ask_everyone_pause", share: "share_the_role", away: "noor_steps_away" }[d2], JSON.stringify(sd?.choices));
  chk(`${name}: no free-text field anywhere in Six Names`, !textFieldSeen);
  const resp = await svc(`mission_responses?progress_id=eq.${prog[0]?.id}&select=screen_key,value`);
  chk(`${name}: no written answer is stored for the run`, resp.every((r) => typeof r.value !== "string" || r.value.length === 0), JSON.stringify(resp).slice(0, 200));
  chk(`${name}: the Judgement was made and recorded as the child's choice`, judged && Object.keys(sd?.choices ?? {}).length >= 3, JSON.stringify(sd?.choices));
  // No cross-child leakage: the Trail shows exactly this child's entries, and no other child appears.
  await b.goto("/academy/missions/six-names/trail", 800);
  const mine = (await svc(`mission_evidence?child_id=eq.${kid.id}&select=id`)).length;
  const shown = await b.eval("document.querySelectorAll('main li[id^=entry-]').length");
  const others = kids.filter((k) => k.id !== kid.id).map((k) => k.display_name).filter((n) => !kid.display_name.includes(n));
  const pageHtml = await html();
  chk(`${name}: the Trail shows exactly this child's entries (${mine})`, shown === mine && mine > 0, `${shown} shown / ${mine} own`);
  chk(`${name}: no other child's name or record appears`, !others.some((n) => pageHtml.includes(n)));
  const unused1 = d1 === "ask" ? "consequence1_stop" : "consequence1_ask";
  chk(`${name}: the unused consequence was never visited`, !sd?.visitedScreens?.includes(unused1), JSON.stringify(sd?.visitedScreens));
  results[name] = { d1, d2, screens: seen.filter((s) => !s.startsWith("__")).length, trail: trail.slice(0, 400) };
  // logout
  await b.goto("/child/logout", 600);
  await b.click(/^log out$/i, { selector: "main button[type=submit]" });
  await b.waitUrl(/\/child\/login|\/login/, 30000);
  await b.goto("/academy/my-missions", 400);
  chk(`${name}: after child logout the Academy is closed`, /\/login|\/child\/login/.test(await b.url()), await b.url());
}
writeFileSync("sixnames-results.json", JSON.stringify(results, null, 1));
await b.close();
process.exit(summary() ? 1 : 0);

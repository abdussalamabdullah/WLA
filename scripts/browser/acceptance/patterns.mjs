// Plan §12 pattern library and §7 thinking prompts, through the Admin UI.
import { launch, chk, summary, uiLogin, ACCOUNTS, sleep } from "./cdp.mjs";
const SLUG = "qa-patterns-mission", TITLE = "QA PATTERNS MISSION";
const b = await launch({ port: 9459 });
await b.viewport(1512, 950);
const main = () => b.eval("(document.querySelector('main')||document.body).innerText");
const settle = async () => { for (let i = 0; i < 200; i++) { const busy = await b.eval("[...document.querySelectorAll('button')].some(x=>/…$/.test(x.innerText.trim()))").catch(() => true); if (!busy) break; await sleep(250); } await sleep(700); };
const builder = `/admin/builder/${SLUG}/1`;

await uiLogin(b, ...ACCOUNTS.admin);
await b.goto("/admin/builder", 800);
if (!(await main()).includes(TITLE)) {
  if (await b.has(/new mission|create a mission|start a new mission/i)) await b.click(/new mission|create a mission|start a new mission/i);
  await b.fill("#title", TITLE); await b.fill("#slug", SLUG);
  const lab = await b.eval("document.querySelector('select[name=lab]').options[1]?.value || document.querySelector('select[name=lab]').options[0].value");
  await b.fill("select[name=lab]", lab); await b.fill("#min_age", "8"); await b.fill("#max_age", "12");
  await b.click(/create/i, { selector: "button[type=submit]" });
  await b.waitUrl(new RegExp(builder), 40000);
}

async function insert(id, prefix) {
  await b.goto(builder, 1000);
  if (new RegExp(`\\b${prefix}`).test(await main())) return chk(`pattern with prefix ${prefix} present`, true);
  await b.eval(`(()=>{const d=[...document.querySelectorAll('details')].find(x=>/Add a mission pattern/.test(x.querySelector('summary')?.innerText||'')); d.open=true;})()`);
  await b.eval(`document.querySelector('input[name=pattern][value=${id}]').click()`);
  await b.fill("#pattern-prefix", prefix);
  await b.click(/^add the pattern$/i, { selector: "button" }); await settle();
  chk(`insert pattern ${id} through the UI`, /Pattern added/.test(await main()), (await main()).match(/Add a mission pattern[\s\S]{0,300}/)?.[0]?.replace(/\n+/g, " | "));
}
await insert("predict_test_reveal_adjust", "a_");
await insert("choose_consequence_reconsider", "b_");

await b.goto(builder, 1000);
const t = await main();
chk("the pattern's screens are in the mission as ordinary screens", /a_predict ·/.test(t) && /a_adjust ·/.test(t) && /b_reconsider ·/.test(t));
chk("the flow map shows the branch and where it meets again (◆)", await b.eval("[...document.querySelectorAll('#flow-map ~ div svg text')].some(x=>/◆/.test(x.textContent))"));

// a clashing prefix is refused
await b.eval(`(()=>{const d=[...document.querySelectorAll('details')].find(x=>/Add a mission pattern/.test(x.querySelector('summary')?.innerText||'')); d.open=true;})()`);
await b.eval(`document.querySelector('input[name=pattern][value=predict_test_reveal_adjust]').click()`);
await b.fill("#pattern-prefix", "a_");
await b.click(/^add the pattern$/i, { selector: "button" }); await settle();
chk("a prefix that would clash is refused", /already exists — use another prefix/.test(await main()));

// thinking prompt
await b.goto(builder, 1000);
if (!/\bthink_notice ·/.test(await main())) {
  await b.click(/^add a screen$/i, { selector: "button" }); await sleep(300);
  await b.fill("#thinking-prompt", "notice"); await sleep(200);
  chk("a thinking prompt fills the type, title and configuration", (await b.eval("document.querySelector('#type').value")) === "response" && (await b.eval("document.querySelector('#title').value")) === "Notice" && /What do you notice/.test(await b.eval("document.querySelector('#configuration-json').value")));
  await b.fill("#screen_key", "think_notice"); await b.fill("#sequence", "5");
  await b.click(/^add screen$/i, { selector: "button[type=submit]" }); await settle();
  chk("the thinking prompt saves as a screen", /Screen saved\./.test(await main()));
}

// preview plays the predict pattern from the start, with recall
await b.goto(`${builder}/preview`, 1200);
await b.waitText(/What do you notice/, 8000);
await b.fill("main textarea, main input:not([type=hidden])", "It wobbles."); await b.click(/save and continue|continue/i, { selector: "main button" }); await sleep(500);
await b.waitText(/What do you think will happen/, 8000);
await b.fill("main textarea, main input:not([type=hidden])", "The tower falls."); await b.click(/save and continue|continue/i, { selector: "main button" }); await sleep(500);
await b.waitText(/Come back when you have tried it/, 8000);
await b.click(/^I.m ready$/i, { selector: "main button" }); await sleep(500);
await b.waitText(/Ready to see what usually happens/, 8000);
await b.click(/^show me$/i, { selector: "main button" }); await sleep(400);
await b.click(/^continue$/i, { selector: "main button" }); await sleep(500);
await b.waitText(/You predicted/, 8000);
chk("recall: the adjust screen shows the child's own prediction", /You predicted: The tower falls\./.test(await main()), (await main()).slice(0, 300));
await b.close?.();
summary();

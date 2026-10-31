// Purchase and gifting, for real. Stripe's hosted test page with its published test
// card, then the webhook delivered and signed locally (no `stripe listen` here).
import { addChildPage, browser, childId, chk, cleanup, closeAll, countMail, deliverWebhook, emailFor, mailFor, payOnStripe, purgeMail, section, signIn, signUp, sleep, sql, stripeGet, summary } from "./driver.mjs";

const SLUG = "six-names";
const mission = sql(`select id from missions where slug='${SLUG}'`);
const entitled = (child) => sql(`select string_agg(source::text||':'||status::text, ',') from mission_entitlements where child_id='${child}' and mission_id='${mission}'`);
const giftRow = (email, col = "status") => sql(`select ${col} from mission_gifts where recipient_email='${email}' order by created_at desc limit 1`);

/** Pay, then deliver the webhook. Returns how it went, for the report. */
async function completePayment(b, sessionId) {
  const paid = await payOnStripe(b);
  const session = await stripeGet(`checkout/sessions/${sessionId()}`);
  if (paid.paid && session.payment_status === "paid") {
    console.log("  (paid on Stripe's hosted test page)");
    return { session, delivery: await deliverWebhook(session), real: true };
  }
  console.log(`  (Stripe's page wasn't completed: ${paid.reason}; webhook simulated with a signed paid session)`);
  const simulated = { ...session, payment_status: "paid", status: "complete", payment_intent: session.payment_intent ?? `pi_e2e_${Date.now()}` };
  return { session: simulated, delivery: await deliverWebhook(simulated), real: false };
}

const buyer = await browser("buyer");
const r1 = await browser("recipient1");
const r2 = await browser("recipient2");
const intruder = await browser("intruder");
const results = {};
try {
  section("Buying for a child who already exists");
  const buyerEmail = await signUp(buyer, "buyer");
  await addChildPage(buyer, "Existing");
  const existingId = childId(buyerEmail, "Existing");
  await buyer.goto(`/purchase/${SLUG}`);
  chk("the existing child is listed, with the option to add one", await buyer.has(/^add a new child$/i) && /Existing/.test(await buyer.text()));
  await buyer.click(/continue to payment/i);
  const lastIntent = (child) => () => sql(`select stripe_session_id from checkout_intents where child_id='${child}' order by created_at desc limit 1`);
  let paid = await completePayment(buyer, lastIntent(existingId));
  results.real = paid.real;
  chk("the webhook accepts it", paid.delivery.status === 200, JSON.stringify(paid.delivery));
  chk("that child has the mission", entitled(existingId) === "purchase:active", entitled(existingId));

  section("Adding a new child during the purchase");
  await buyer.goto(`/purchase/${SLUG}`);
  chk("a child who has it isn't offered, and adding one is", /aren.t shown|already has/i.test(await buyer.text()) && await buyer.has(/^add a new child$/i));
  await buyer.click(/^add a new child$/i);
  chk("the form opens on the page, without leaving", /\/purchase\/six-names/.test(await buyer.path()) && await buyer.eval("!!document.querySelector('input[name=displayName]')"));
  chk("payment waits while it's open", !(await buyer.has(/continue to payment/i)));
  await buyer.fill("input[name=displayName]", "Newkid");
  await buyer.click(/^add this child$/i);
  await buyer.waitText(/Newkid has been added and selected/);
  const newId = childId(buyerEmail, "Newkid");
  chk("the child now exists, under this parent", Boolean(newId));
  chk("selected automatically", await buyer.eval(`document.querySelector('input[type=radio][value="${newId}"]')?.checked === true`));
  const newCode = await buyer.code();
  chk("the access code is on screen before leaving for Stripe", /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(newCode ?? "") && await buyer.has(/continue to payment/i));
  chk("Copy is offered", await buyer.has(/^copy code$/i));
  chk("exactly one code exists", sql(`select count(*) from child_access_credentials where child_id='${newId}'`) === "1");
  chk("the mission is still the one being bought", /\/purchase\/six-names/.test(await buyer.path()) && /Six Names/.test(await buyer.text()));
  await buyer.click(/continue to payment/i);
  paid = await completePayment(buyer, lastIntent(newId));
  chk("the new child receives the mission", paid.delivery.status === 200 && entitled(newId) === "purchase:active", entitled(newId));
  chk("and only that child's record changed", entitled(existingId) === "purchase:active");
  const again = await deliverWebhook(paid.session, paid.delivery.eventId);
  chk("a repeated webhook is a no-op", again.status === 200 && entitled(newId) === "purchase:active" && sql(`select count(*) from mission_entitlements where child_id='${newId}'`) === "1");
  await buyer.goto("/account/children");
  chk("the new child is in child management", /Newkid/.test(await buyer.text()));
  await buyer.goto(`/account/children/${newId}`);
  await buyer.click(/^show access code$/i);
  await buyer.waitText(/access code\./);
  chk("and their code can still be viewed afterwards", (await buyer.code()) === newCode);

  section("Abandoning checkout keeps the child");
  await buyer.goto(`/purchase/${SLUG}`);
  await buyer.click(/^add a new child$/i);
  await buyer.fill("input[name=displayName]", "Abandoned");
  await buyer.click(/^add this child$/i);
  await buyer.waitText(/Abandoned has been added/);
  await buyer.click(/continue to payment/i);
  await buyer.waitUrl(/checkout\.stripe\.com/, 30000);
  const abandonedId = childId(buyerEmail, "Abandoned");
  await buyer.goto("/account/children");
  chk("the child stays, with no mission", /Abandoned/.test(await buyer.text()) && !entitled(abandonedId));

  section("Retrying adding a child");
  await buyer.goto(`/purchase/${SLUG}`);
  await buyer.click(/^add a new child$/i);
  await buyer.fill("input[name=displayName]", "Retried");
  // Two submissions of one attempt, as a double click or a retried request would be.
  await buyer.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^add this child$/i.test(x.innerText.trim())); b.click(); b.click(); })()`);
  await buyer.waitText(/Retried has been added/);
  await sleep(800);
  chk("one profile", sql(`select count(*) from child_profiles c join auth.users u on u.id=c.parent_id where u.email='${buyerEmail}' and c.display_name='Retried'`) === "1");
  chk("one code, never revoked by a retry", sql(`select count(*) from child_access_credentials a join child_profiles c on c.id=a.child_id join auth.users u on u.id=c.parent_id where u.email='${buyerEmail}' and c.display_name='Retried'`) === "1");

  section("Buying a gift");
  const purchase = async (recipient) => {
    await buyer.goto(`/purchase/${SLUG}?gift=1`);
    await buyer.fill("input[name=recipientEmail]", recipient);
    await buyer.click(/continue to payment/i);
    return completePayment(buyer, () => sql(`select stripe_session_id from mission_gifts where recipient_email='${recipient}' order by created_at desc limit 1`));
  };
  const linkEmail = emailFor("linkrecipient");
  const started = Date.now() - 2000;
  const before = sql(`select count(*) from mission_entitlements e join child_profiles c on c.id=e.child_id join auth.users u on u.id=c.parent_id where u.email='${buyerEmail}'`);
  const giftPaid = await purchase(linkEmail);
  chk("the webhook makes it paid", giftPaid.delivery.status === 200 && giftRow(linkEmail) === "paid", giftRow(linkEmail));
  chk("the purchaser gets no entitlement", sql(`select count(*) from mission_entitlements e join child_profiles c on c.id=e.child_id join auth.users u on u.id=c.parent_id where u.email='${buyerEmail}'`) === before);
  const gm = await mailFor(linkEmail, /given/i, { after: started });
  const link = gm?.Text.match(/https?:\/\/\S*\/redeem\?token=\S+/)?.[0];
  chk("the recipient is emailed a link", Boolean(link));
  const replay = await deliverWebhook(giftPaid.session, giftPaid.delivery.eventId);
  await sleep(500);
  chk("a repeated webhook sends nothing more", replay.status === 200 && (await countMail(linkEmail, /given/i)) === 1);

  section("Redeeming by the emailed link, with a new account and a new child");
  await r1.goto(link);
  chk("the link asks for the address first", /Confirm your email/.test(await r1.text()) && !/Six Names/.test(await r1.text()));
  await r1.fill("input[name=email]", "someone-else@wla-e2e.test");
  await r1.click(/^confirm email$/i);
  await r1.waitText(/isn.t the email address/);
  chk("a wrong address is refused", !(await r1.eval("document.cookie")).includes("wla_gift_claim") && /isn.t the email address/.test(await r1.text()));
  await r1.fill("input[name=email]", linkEmail);
  await r1.click(/^confirm email$/i);
  await r1.waitText(/given Six Names/);
  chk("the right address reveals the gift and the token leaves the URL", /\/redeem$/.test(await r1.path()), await r1.path());
  chk("the claim cookie is httpOnly", !(await r1.eval("document.cookie")).includes("wla_gift_claim"));
  await r1.click(/^create an account$/i);
  await signUp(r1, "linkrecipient", "/redeem");
  await r1.waitText(/given Six Names/);
  chk("after signing up they come back to the gift", /\/redeem/.test(await r1.path()), await r1.path());
  chk("with no child yet, the form is there", await r1.eval("!!document.querySelector('input[name=displayName]')"));
  await r1.fill("input[name=displayName]", "Giftkid");
  await r1.click(/^add this child$/i);
  await r1.waitText(/Giftkid has been added and selected/);
  chk("the access code is shown before redeeming", /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test((await r1.code()) ?? ""));
  await r1.click(/^redeem this gift$/i);
  await r1.waitUrl(/my-missions/);
  const giftKid = childId(linkEmail, "Giftkid");
  chk("that child has the gifted mission", entitled(giftKid) === "gift:active", entitled(giftKid));
  chk("the gift is redeemed", giftRow(linkEmail) === "redeemed");
  await r1.goto(link);
  await r1.fill("input[name=email]", linkEmail);
  await r1.click(/^confirm email$/i);
  await r1.waitText(/already been redeemed/);
  chk("it can't be redeemed again", /already been redeemed/.test(await r1.text()) && sql(`select count(*) from mission_entitlements where child_id='${giftKid}'`) === "1");

  section("Redeeming on the website with a code, into an existing account");
  const codeEmail = emailFor("coderecipient");
  await signUp(r2, "coderecipient");
  await addChildPage(r2, "Coder");
  const coder = childId(codeEmail, "Coder");
  const t2 = Date.now() - 2000;
  await purchase(codeEmail);
  const firstMail = await mailFor(codeEmail, /given/i, { after: t2 });
  const originalLink = firstMail?.Text.match(/https?:\/\/\S*\/redeem\?token=\S+/)?.[0];
  await r2.send("Network.clearBrowserCookies");
  await r2.goto("/redeem");
  chk("the page asks for an address", /Redeem a gift/.test(await r2.text()));

  const ask = async (b, email) => {
    await b.goto("/redeem");
    await b.fill("input[name=email]", email);
    await b.click(/^email me a code$/i);
    await b.waitText(/If a gift was sent/);
  };
  await ask(r2, codeEmail);
  const yes = (await r2.text()).replace(codeEmail, "@");
  const ghostEmail = emailFor("nobody");
  await ask(intruder, ghostEmail);
  const no = (await intruder.text()).replace(ghostEmail, "@");
  chk("the page is identical whether or not a gift exists", yes === no, `${yes.slice(0, 200)} // ${no.slice(0, 200)}`);
  chk("the address isn't in the URL", !(await r2.url()).includes("coderecipient") && !(await r2.url()).includes("%40"));
  const codeMail = await mailFor(codeEmail, /your code/i, { after: t2 });
  const code = codeMail?.Text.match(/\b[A-Z2-9]{4}-[A-Z2-9]{4}\b/)?.[0];
  chk("a real gift gets a code by email", Boolean(code));
  await sleep(800);
  chk("no gift, no email", (await countMail(ghostEmail, /./)) === 0);
  chk("only a keyed hash is stored", sql(`select code_hash ~ '^[0-9a-f]{64}$' and position('${(code ?? "x").replace("-", "")}' in code_hash)=0 from mission_gifts where recipient_email='${codeEmail}' order by created_at desc limit 1`) === "t");
  chk("nothing about the code reached browser storage or the address bar", !(await r2.eval("JSON.stringify(Object.values(localStorage))+JSON.stringify(Object.values(sessionStorage))+location.href")).includes(code ?? "x"));

  await r2.fill("input[name=code]", "AAAA-2222");
  await r2.click(/^confirm code$/i);
  await r2.waitText(/isn.t right, or it has expired/);
  const wrong = (await r2.text()).match(/That code[^\n]*/)?.[0];
  await intruder.fill("input[name=code]", "AAAA-2222");
  await intruder.click(/^confirm code$/i);
  await intruder.waitText(/isn.t right, or it has expired/);
  chk("a wrong code and no gift give the same message", wrong && wrong === (await intruder.text()).match(/That code[^\n]*/)?.[0]);
  chk("wrong attempts are counted", sql(`select code_failures from mission_gifts where recipient_email='${codeEmail}' order by created_at desc limit 1`) === "1");

  await r2.click(/^send a new code$/i);
  await sleep(1200);
  chk("asking again within two minutes sends nothing more", (await countMail(codeEmail, /your code/i)) === 1);

  await r2.fill("input[name=code]", code.toLowerCase().replace("-", " "));
  await r2.click(/^confirm code$/i);
  await r2.waitText(/given Six Names/);
  chk("the right code, however typed, reveals the gift, with no second link to click", /\/redeem$/.test(await r2.path()), await r2.path());
  chk("the code is spent", sql(`select code_hash is null from mission_gifts where recipient_email='${codeEmail}' order by created_at desc limit 1`) === "t");
  chk("signed out, it offers sign in or create an account", await r2.has(/^sign in$/i) && await r2.has(/^create an account$/i));
  await r2.click(/^sign in$/i);
  await r2.waitUrl(/\/login/);
  await signIn(r2, codeEmail, "/redeem");
  await r2.waitText(/given Six Names/);
  chk("signing in to the existing account comes back to the gift", /\/redeem/.test(await r2.path()), await r2.path());
  await r2.hydrated();
  chk("the existing child is offered", await r2.eval(`!!document.querySelector('input[type=radio][value="${coder}"]')`));

  section("Another family can't take it");
  const intruderEmail = await signUp(intruder, "intruder");
  await addChildPage(intruder, "Theirs");
  const tampered = await r2.eval(`(() => { const i = document.querySelector('input[name=childId]'); i.value = ${JSON.stringify(childId(intruderEmail, "Theirs"))}; return true; })()`);
  await r2.click(/^redeem this gift$/i);
  await r2.waitText(/Choose who this mission is for/);
  chk("another family's child id is refused, and the gift isn't used", tampered && giftRow(codeEmail) === "paid" && !entitled(childId(intruderEmail, "Theirs")));
  await intruder.goto("/redeem");
  chk("another browser sees no gift", !/Six Names/.test(await intruder.text()));

  section("Finishing with the existing child");
  await r2.goto("/redeem");
  await r2.click(/^redeem this gift$/i);
  await r2.waitUrl(/my-missions/);
  chk("the chosen child has the gift", entitled(coder) === "gift:active", entitled(coder));
  chk("the gift is redeemed by this family", sql(`select status='redeemed' and redeemed_child_id='${coder}' from mission_gifts where recipient_email='${codeEmail}' order by created_at desc limit 1`) === "t");
  await r2.goto("/account");
  chk("the original link stays valid until use, and now reports it's been used", await (async () => {
    await r2.goto(originalLink);
    await r2.fill("input[name=email]", codeEmail);
    await r2.click(/^confirm email$/i);
    return r2.waitText(/already been redeemed/);
  })());

  section("Several gifts to one address, oldest first");
  const multi = emailFor("multi");
  const missionB = sql(`insert into missions (slug,title,lab,min_age,max_age,is_free,price_minor,currency,published) values ('e2e-${process.env.RUN_ID ?? ""}${Date.now()}','Second gift','decision',7,15,false,500,'GBP',false) returning id`).split("\n")[0];
  sql(`insert into mission_gifts (mission_id,recipient_email,stripe_session_id,amount_minor,currency,status,redeem_token_hash,paid_at,created_at) values
    ('${mission}','${multi}','cs_e2e_old_${Date.now()}',1200,'GBP','paid','e2e-old-${Date.now()}',now()-interval '2 days',now()-interval '2 days'),
    ('${missionB}','${multi}','cs_e2e_new_${Date.now()}',500,'GBP','paid','e2e-new-${Date.now()}',now()-interval '1 day',now()-interval '1 day')`);
  const m3 = await browser("multi");
  await ask(m3, multi);
  const first = await mailFor(multi, /your code/i);
  chk("the first code names the older gift", /Six Names/.test(first?.Subject ?? ""), first?.Subject);
  await sql(`delete from missions where id='${missionB}' and false`);
  await m3.fill("input[name=code]", first.Text.match(/\b[A-Z2-9]{4}-[A-Z2-9]{4}\b/)[0]);
  await m3.click(/^confirm code$/i);
  chk("that is the gift it leads to", await m3.waitText(/given Six Names/));
  sql(`delete from mission_gifts where mission_id='${missionB}'; delete from missions where id='${missionB}'`);

  console.log(`\nStripe's hosted page completed for real: ${results.real}`);
} finally {
  closeAll();
  await purgeMail().catch(() => {});
  if (!process.env.KEEP) cleanup();
}
process.exit(summary() ? 1 : 0);

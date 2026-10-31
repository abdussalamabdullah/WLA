// Mission covers (D-146), for real, across the Academy and the website.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ENV, RUN, SUPABASE, WEBSITE, browser, chk, cleanup, closeAll, purgeMail, section, ensureAccount, sleep, sql, summary, tokenFor } from "./driver.mjs";

const DIR = "/tmp/wla-local-journeys/covers";
mkdirSync(DIR, { recursive: true });
const SOURCE = new URL("../../../public/missions/six-names.jpg", import.meta.url).pathname;
const png = `${DIR}/a.png`, webp = `${DIR}/c.jpg`, svg = `${DIR}/x.svg`, fakePng = `${DIR}/fake.png`, gif = `${DIR}/d.gif`;
execFileSync("sips", ["-s", "format", "png", "-Z", "640", SOURCE, "--out", png], { stdio: "ignore" });
execFileSync("sips", ["-s", "format", "jpeg", "-Z", "500", SOURCE, "--out", webp], { stdio: "ignore" });
writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
writeFileSync(fakePng, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
writeFileSync(gif, Buffer.from("R0lGODlhAQABAAAAACw=", "base64"));

const slug = `e2e-${RUN}-cover`, slug2 = `e2e-${RUN}-shared`;
const objects = () => sql(`select name from storage.objects where bucket_id='mission-covers' and name like '${missionId()}/%' order by 1`).split("\n").filter(Boolean);
let idCache;
const missionId = () => (idCache ??= sql(`select id from missions where slug='${slug}'`));
const coverOf = (s) => sql(`select coalesce(cover_image,'') from missions where slug='${s}'`);
const publicUrl = (v) => `${SUPABASE}/storage/v1/object/public/${v}`;

const admin = await browser("admin");
const parent = await browser("parent");
const SIX = sql("select cover_image from missions where slug='six-names'");
let idForMission;
try {
  section("Setting up");
  sql(`insert into missions (slug,title,description,lab,min_age,max_age,is_free,price_minor,currency,published) values
    ('${slug}','E2E cover mission','A test mission','decision',7,15,false,500,'GBP',true),
    ('${slug2}','E2E shared cover','A test mission','decision',7,15,false,500,'GBP',true)`);
  idForMission = missionId();
  const adminEmail = await ensureAccount(admin, "cover-admin");
  sql(`update profiles set is_admin=true where id=(select id from auth.users where email='${adminEmail}')`);
  const parentEmail = await ensureAccount(parent, "cover-parent");
  sql(`insert into child_profiles (parent_id,display_name) select id,'Coverkid' from auth.users where email='${parentEmail}';
       insert into mission_entitlements (child_id,mission_id,source) select c.id,'${idForMission}','admin' from child_profiles c join auth.users u on u.id=c.parent_id where u.email='${parentEmail}'`);

  section("Choosing an image");
  await admin.goto(`/admin/missions/${slug}`);
  chk("there is no path to type", !(await admin.eval("!!document.querySelector('input[type=text][name=cover_image], input:not([type])[name=cover_image]')")) && !/A path the Academy can serve/.test(await admin.text()));
  chk("it offers Choose image", await admin.has(/^choose image$/i));
  const pick = async (file) => { await admin.setFile("input[type=file][aria-label='Cover image file']", file); await sleep(300); };
  const quiet = async () => { for (let i = 0; i < 80; i++) { if (!(await admin.has(/uploading/i, "button"))) return; await sleep(250); } };

  await pick(svg); await quiet();
  await admin.waitText(/Use a PNG, JPEG or WebP/, 8000);
  chk("an SVG is refused", /Use a PNG, JPEG or WebP/.test(await admin.text()) && objects().length === 0);
  await pick(fakePng); await quiet();
  chk("an SVG named .png is refused by its bytes", /Use a PNG, JPEG or WebP/.test(await admin.text()) && objects().length === 0);
  await pick(gif); await quiet();
  chk("a GIF is refused", /Use a PNG, JPEG or WebP/.test(await admin.text()) && objects().length === 0);

  await pick(png); await quiet();
  await admin.waitText(/Not saved yet/);
  const first = await admin.eval("document.querySelector('input[name=cover_image]').value");
  chk("a valid image uploads", /^mission-covers\/.+\.(png|webp)$/.test(first) && objects().length === 1, first);
  chk("the preview appears", await admin.imageLoaded(first));
  chk("the mission hasn't changed until Save", coverOf(slug) === "");
  chk("the unsaved-changes note shows", /Unsaved changes/.test(await admin.text()));

  await pick(webp); await quiet();
  const second = await admin.eval("document.querySelector('input[name=cover_image]').value");
  await sleep(800);
  chk("replacing an unsaved upload deletes it", second !== first && objects().length === 1 && objects()[0] === second.replace("mission-covers/", ""));

  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  chk("Save stores it on the mission", coverOf(slug) === second);
  chk("the unsaved note clears", await (async () => { await sleep(400); return !/Unsaved changes/.test(await admin.text()); })());
  await admin.goto(`/admin/missions/${slug}`);
  chk("admin mission details still show it after reloading", await admin.imageLoaded(second));
  const res = await fetch(publicUrl(second));
  chk("its public address works with no session", res.ok && /^image\//.test(res.headers.get("content-type") ?? ""));

  section("Where it displays");
  await parent.goto("/academy/my-missions");
  chk("My Missions displays it", await parent.imageLoaded(second.split("/").pop()), (await parent.text()).slice(0, 200));
  const site = await browser("website");
  await site.goto(`${WEBSITE}/missions`);
  chk("the website's catalogue displays it", await site.imageLoaded(second), (await site.text()).slice(0, 200));
  await site.goto(`${WEBSITE}/missions/${slug}`);
  chk("the website's mission page displays it", await site.imageLoaded(second));
  await site.goto(`${WEBSITE}/missions/six-names`);
  chk("Six Names' image no longer breaks on the website", await site.imageLoaded("/missions/six-names.jpg"));
  await site.goto(`${WEBSITE}/missions`);
  chk("nor in its catalogue", await site.imageLoaded("/missions/six-names.jpg"));

  const anon = await browser("anon");
  await anon.goto("/missions");
  chk("Academy's public catalogue shows Six Names' image", await anon.imageLoaded("six-names.jpg"));
  await anon.goto("/missions/six-names");
  chk("as does its mission page", await anon.imageLoaded("six-names.jpg"));
  chk("with its written description kept", await anon.eval("[...document.images].some(i => /kraft cards/.test(i.alt))"));
  try {
    sql(`update missions set cover_image='${second}' where slug='six-names'`);
    await anon.goto("/missions");
    chk("Academy's public catalogue uses an uploaded cover", await anon.imageLoaded(second.split("/").pop()));
    await anon.goto("/missions/six-names");
    chk("and so does its mission page", await anon.imageLoaded(second.split("/").pop()));
  } finally {
    sql(`update missions set cover_image='${SIX}' where slug='six-names'`);
  }
  chk("Six Names' cover is back as it was", coverOf("six-names") === SIX);

  section("Sharing, replacing, removing");
  sql(`update missions set cover_image='${second}' where slug='${slug2}'`);
  await admin.goto(`/admin/missions/${slug}`);
  await pick(png); await quiet();
  await admin.waitText(/Not saved yet/);
  const third = await admin.eval("document.querySelector('input[name=cover_image]').value");
  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  await sleep(800);
  chk("replacing saves the new image", coverOf(slug) === third);
  chk("a file another mission uses isn't deleted", objects().includes(second.replace("mission-covers/", "")) && (await fetch(publicUrl(second))).ok);
  sql(`update missions set cover_image=null where slug='${slug2}'`);

  await admin.goto(`/admin/missions/${slug}`);
  await pick(webp); await quiet();
  await admin.waitText(/Not saved yet/);
  const fourth = await admin.eval("document.querySelector('input[name=cover_image]').value");
  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  await sleep(800);
  chk("once nothing uses it, the replaced file is deleted", !objects().includes(third.replace("mission-covers/", "")), JSON.stringify(objects()));

  await admin.goto(`/admin/missions/${slug}`);
  await admin.click(/^remove image$/i);
  await admin.waitText(/Press Save changes to remove/);
  chk("removing doesn't touch the file until Save", objects().includes(fourth.replace("mission-covers/", "")) && coverOf(slug) === fourth);
  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  await sleep(800);
  chk("Save removes it from the mission", coverOf(slug) === "");
  chk("and deletes the unused file", !objects().includes(fourth.replace("mission-covers/", "")), JSON.stringify(objects()));

  section("An abandoned upload");
  await admin.goto(`/admin/missions/${slug}`);
  await pick(png); await quiet();
  await admin.waitText(/Not saved yet/);
  const stranded = await admin.eval("document.querySelector('input[name=cover_image]').value");
  await admin.eval("window.onbeforeunload = null");
  sql(`update storage.objects set created_at = now() - interval '2 hours' where bucket_id='mission-covers' and name='${stranded.replace("mission-covers/", "")}'`);
  // Discard in place, leaving only the old orphan for the sweep on the next save.
  await admin.click(/^remove image$/i).catch(() => {});
  await sleep(800);
  await admin.goto(`/admin/missions/${slug}`);
  chk("an upload removed before saving is cleaned up", !objects().includes(stranded.replace("mission-covers/", "")));
  const orphan = `${idForMission}/${randomBytes(8).toString("hex")}.png`;
  const adminToken = await tokenFor(adminEmail);
  const up = (path, bucket, token, body, type = "image/png") => fetch(`${SUPABASE}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": type, "x-upsert": "false" }, body });
  const bytes = (await import("node:fs")).readFileSync(png);
  const uploaded = await up(orphan, "mission-covers", adminToken, bytes);
  chk("(an orphan is planted through the API)", uploaded.ok, uploaded.status);
  sql(`update storage.objects set created_at = now() - interval '2 hours' where bucket_id='mission-covers' and name='${orphan}'`);
  await admin.goto(`/admin/missions/${slug}`);
  await admin.fill("input[name=duration]", "20 minutes");
  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  await sleep(800);
  chk("a tab closed mid-upload is swept on a later save, once an hour old", !objects().includes(orphan), JSON.stringify(objects()));

  section("Who may do what");
  const parentToken = await tokenFor(parentEmail);
  const path = `${idForMission}/${randomBytes(8).toString("hex")}.png`;
  chk("a parent's upload is refused", !(await up(path, "mission-covers", parentToken, bytes)).ok);
  chk("an anonymous upload is refused", !(await fetch(`${SUPABASE}/storage/v1/object/mission-covers/${path}`, { method: "POST", headers: { apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "image/png" }, body: bytes })).ok);
  const keep = `${idForMission}/${randomBytes(8).toString("hex")}.png`;
  await up(keep, "mission-covers", adminToken, bytes);
  const del = (p, token) => fetch(`${SUPABASE}/storage/v1/object/mission-covers/${p}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
  await del(keep, parentToken);
  chk("a parent's delete does nothing", objects().includes(keep));
  await fetch(`${SUPABASE}/storage/v1/object/mission-covers/${keep}`, { method: "DELETE", headers: { apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
  chk("nor does an anonymous one", objects().includes(keep));
  chk("the server refuses an SVG type outright", !(await up(`${idForMission}/x.png`, "mission-covers", adminToken, bytes, "image/svg+xml")).ok);
  chk("and a file over 10 MB", !(await up(`${idForMission}/big.png`, "mission-covers", adminToken, Buffer.alloc(10 * 1024 * 1024 + 10))).ok);
  await del(keep, adminToken);
  chk("an administrator can delete an unused file", !objects().includes(keep));
  chk("the private media bucket isn't readable by public address", !(await fetch(`${SUPABASE}/storage/v1/object/public/mission-media/anything.png`)).ok);
  chk("and is still private", sql("select public from storage.buckets where id='mission-media'") === "f");
  await parent.goto(`/admin/missions/${slug}`);
  chk("a parent can't reach the admin page", !/\/admin\/missions/.test(await parent.path()) || !(await parent.has(/choose image/i)));

  section("Duplicating a mission, for real");
  const adminId = sql(`select id from auth.users where email='${adminEmail}'`);
  const duplicate = async (source, to) => {
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/admin_duplicate_mission`, {
      method: "POST",
      headers: { apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_source_id: sql(`select id from missions where slug='${source}'`), p_slug: to, p_title: `E2E duplicate ${to}` }),
    });
    return { status: res.status, adminId };
  };
  const d1 = `e2e-${RUN}-dup1`, d2 = `e2e-${RUN}-dup2`;
  const made = await duplicate("six-names", d1);
  chk("Six Names can be duplicated as a draft, with its cover reference", coverOf(d1) === SIX, JSON.stringify(made));
  await admin.goto(`/admin/missions/${d1}`);
  await pick(png); await quiet();
  await admin.waitText(/Not saved yet/);
  const shared = await admin.eval("document.querySelector('input[name=cover_image]').value");
  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  await duplicate(d1, d2);
  chk("duplicating keeps the same cover reference", coverOf(d2) === shared && coverOf(d1) === shared);
  await admin.goto(`/admin/builder/${d2}/1`);
  chk("Mission Builder shows the preview on a draft", await admin.imageLoaded(shared.split("/").pop()), (await admin.path()) + (await admin.text()).slice(0, 200));
  await admin.goto(`/admin/missions/${d1}`);
  await admin.click(/^remove image$/i);
  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  await sleep(800);
  chk("removing it from the source keeps the file the duplicate uses", coverOf(d1) === "" && (await fetch(publicUrl(shared))).ok);
  await admin.goto(`/admin/missions/${d2}`);
  chk("and the duplicate still shows it", await admin.imageLoaded(shared));
  await admin.click(/^remove image$/i);
  await admin.click(/^save changes$/i);
  await admin.waitText(/Saved\./);
  await sleep(800);
  chk("when the last mission lets go, the file is deleted", !(await fetch(publicUrl(shared))).ok);
  chk("Six Names is unchanged by being duplicated", coverOf("six-names") === SIX && sql("select published from missions where slug='six-names'") === "t");
} finally {
  closeAll();
  sql(`update missions set cover_image='${SIX}' where slug='six-names'`);
  if (idForMission) {
    const left = sql(`select name from storage.objects where bucket_id='mission-covers' and name like '${idForMission}/%'`).split("\n").filter(Boolean);
    for (const name of left) await fetch(`${SUPABASE}/storage/v1/object/mission-covers/${name}`, { method: "DELETE", headers: { Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`, apikey: ENV.SUPABASE_SERVICE_ROLE_KEY } });
  }
  await purgeMail().catch(() => {});
  if (!process.env.KEEP) cleanup();
}
process.exit(summary() ? 1 : 0);

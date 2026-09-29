/**
 * Produce the exact cookies @supabase/ssr writes for a signed-in parent.
 *
 * The library does it, not us — a hand-rolled cookie would drift from whatever
 * chunking and encoding @supabase/ssr uses next. No password is typed into any
 * form; the QA account signs in through the SDK and the resulting cookies are
 * injected straight into the browser.
 *
 * Usage: SB_URL=… SB_ANON=… EMAIL=… PASSWORD=… OUT=… node session-cookies.cjs
 *
 * The CJS build is required explicitly: the ESM build ships specifier-less
 * relative imports that Node will not resolve.
 */
const { createBrowserClient } = require(
  require("node:path").join(__dirname, "../../node_modules/@supabase/ssr/dist/main/index.js"),
);
const { writeFileSync } = require("node:fs");

(async () => {
  const store = new Map();
  const client = createBrowserClient(process.env.SB_URL, process.env.SB_ANON, {
    cookies: {
      getAll: () => [...store.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => store.set(name, value)),
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.EMAIL,
    password: process.env.PASSWORD,
  });
  if (error) {
    console.error("sign-in failed:", error.message);
    process.exit(1);
  }
  writeFileSync(
    process.env.OUT,
    JSON.stringify([...store.entries()].map(([name, value]) => ({ name, value })), null, 1),
  );
  console.log(`cookies written for ${data.user.email}`);
})();

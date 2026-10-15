// node --test scripts/qa-accounts.test.mjs — uses FAKE values only.
import { after, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { qaAccount, resetQaAccountCache } from "./qa-accounts.mjs";

const dir = mkdtempSync(join(tmpdir(), "wla-qa-accounts-"));
const file = (body, mode = 0o600) => {
  const p = join(dir, `f-${Math.random().toString(36).slice(2)}`);
  writeFileSync(p, body);
  chmodSync(p, mode);
  return p;
};
const BODY = "# comment\nWLA_QA_A_EMAIL=a@example.test\nWLA_QA_A_PASSWORD=fake-a-pass\nWLA_QA_B_EMAIL=b@example.test\nWLA_QA_B_PASSWORD=fake=b=pass\n";

beforeEach(() => resetQaAccountCache());
after(() => rmSync(dir, { recursive: true, force: true }));

test("environment variables win, and the file is not needed", () => {
  const env = { WLA_QA_A_EMAIL: "env@example.test", WLA_QA_A_PASSWORD: "env-pass" };
  assert.deepEqual(qaAccount("admin", { env, file: join(dir, "does-not-exist") }), ["env@example.test", "env-pass"]);
});

test("the private file is read when the environment has nothing (values may contain '=')", () => {
  const f = file(BODY);
  assert.deepEqual(qaAccount("admin", { env: {}, file: f }), ["a@example.test", "fake-a-pass"]);
  assert.deepEqual(qaAccount("parent", { env: {}, file: f }), ["b@example.test", "fake=b=pass"]);
});

test("a file other users can read is refused", () => {
  const f = file(BODY, 0o644);
  assert.throws(() => qaAccount("admin", { env: {}, file: f }), /readable by other users/);
});

test("the refusal stays a permissions error on every later call, never 'not configured'", () => {
  const f = file(BODY, 0o640);
  for (const role of ["admin", "admin", "parent"]) {
    assert.throws(() => qaAccount(role, { env: {}, file: f }), (e) => {
      assert.match(e.message, /readable by other users/);
      assert.doesNotMatch(e.message, /not configured|fake|example\.test/);
      return true;
    });
  }
});

test("missing credentials name the variables but never print a value", () => {
  const f = file(BODY);
  assert.throws(() => qaAccount("family", { env: {}, file: f }), (e) => {
    assert.match(e.message, /WLA_QA_C_EMAIL and WLA_QA_C_PASSWORD/);
    assert.doesNotMatch(e.message, /fake|example\.test/);
    return true;
  });
  resetQaAccountCache();
  assert.throws(() => qaAccount("admin", { env: { WLA_QA_A_EMAIL: "x@example.test" }, file: join(dir, "none") }), (e) => {
    assert.match(e.message, /set WLA_QA_A_PASSWORD,/);
    assert.doesNotMatch(e.message, /x@example/);
    return true;
  });
});

test("an unknown role is an error", () => {
  assert.throws(() => qaAccount("root", { env: {} }), /unknown QA account role/);
});

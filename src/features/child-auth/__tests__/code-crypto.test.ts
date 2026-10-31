import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CodeCopyError,
  CodeKeyError,
  isUnderCurrentKey,
  openCode,
  resealCode,
  sealCode,
} from "../code-crypto";

const key = () => randomBytes(32).toString("base64");
const binding = { childId: "child-1", credentialId: "cred-1" };
const CODE = "ABCD-2345";

describe("the encrypted copy of a child's code (D-143)", () => {
  it("opens to the same code", () => {
    const keys = { current: key() };
    expect(openCode(sealCode(CODE, binding, keys), binding, keys)).toBe(CODE);
  });

  it("never holds the code in readable form, and differs every time", () => {
    const keys = { current: key() };
    const a = sealCode(CODE, binding, keys);
    expect(a).not.toContain(CODE);
    expect(a).not.toContain(Buffer.from(CODE).toString("base64url"));
    expect(sealCode(CODE, binding, keys)).not.toBe(a);
  });

  it("can't be moved to another child", () => {
    const keys = { current: key() };
    const sealed = sealCode(CODE, binding, keys);
    expect(() => openCode(sealed, { ...binding, childId: "child-2" }, keys)).toThrow(CodeCopyError);
  });

  it("can't be moved to another credential", () => {
    const keys = { current: key() };
    const sealed = sealCode(CODE, binding, keys);
    expect(() => openCode(sealed, { ...binding, credentialId: "cred-2" }, keys)).toThrow(CodeCopyError);
  });

  it("fails when altered", () => {
    const keys = { current: key() };
    const parts = sealCode(CODE, binding, keys).split(".");
    const body = Buffer.from(parts[4], "base64url");
    body[0] ^= 1;
    parts[4] = body.toString("base64url");
    expect(() => openCode(parts.join("."), binding, keys)).toThrow(CodeCopyError);
  });

  it("won't open with a different key", () => {
    const sealed = sealCode(CODE, binding, { current: key() });
    expect(() => openCode(sealed, binding, { current: key() })).toThrow(CodeCopyError);
  });

  it("refuses to seal without a key, or with one of the wrong size, and never echoes it", () => {
    expect(() => sealCode(CODE, binding, {})).toThrow(CodeKeyError);
    const bad = Buffer.from("too-short").toString("base64");
    try {
      sealCode(CODE, binding, { current: bad });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CodeKeyError);
      expect(String(e)).not.toContain(bad);
    }
  });

  it("refuses an unknown format", () => {
    expect(() => openCode("nonsense", binding, { current: key() })).toThrow(CodeCopyError);
  });

  describe("rotation", () => {
    it("a copy made with the old key still opens during the rotation", () => {
      const old = key();
      const sealed = sealCode(CODE, binding, { current: old });
      expect(openCode(sealed, binding, { current: key(), previous: old })).toBe(CODE);
    });

    it("re-encrypting moves it to the new key, and the old key is then not needed", () => {
      const old = key();
      const next = key();
      const sealed = sealCode(CODE, binding, { current: old });
      expect(isUnderCurrentKey(sealed, { current: next })).toBe(false);
      const moved = resealCode(sealed, binding, { current: next, previous: old });
      expect(isUnderCurrentKey(moved, { current: next })).toBe(true);
      expect(openCode(moved, binding, { current: next })).toBe(CODE);
      expect(() => openCode(moved, binding, { current: old })).toThrow(CodeCopyError);
    });
  });
});

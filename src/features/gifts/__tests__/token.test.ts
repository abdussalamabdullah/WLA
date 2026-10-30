import { describe, expect, it } from "vitest";
import { hashGiftToken, looksLikeGiftToken, newGiftToken, normaliseGiftEmail } from "../token";

describe("gift tokens", () => {
  it("are long, random and URL-safe, and only their hash is kept", () => {
    const a = newGiftToken();
    const b = newGiftToken();
    expect(a.token).not.toBe(b.token);
    expect(looksLikeGiftToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashGiftToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses anything that could not be one", () => {
    for (const bad of [undefined, null, "", "short", "x".repeat(44), "a/b".padEnd(43, "c")]) {
      expect(looksLikeGiftToken(bad)).toBe(false);
    }
  });

  it("compares addresses by one rule", () => {
    expect(normaliseGiftEmail("  Someone@Example.COM ")).toBe("someone@example.com");
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatLondon, londonWallTimeToUtc } from "../time";

/* D-133: scheduling is entered in Europe/London and stored as a UTC instant. */
const utc = (local: string) => {
  const r = londonWallTimeToUtc(local);
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("London wall time → UTC", () => {
  it("winter (GMT) is UTC+0", () => {
    expect(utc("2026-01-15T09:00").utc.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });
  it("summer (BST) is UTC+1", () => {
    expect(utc("2026-07-15T09:00").utc.toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });
  it("the minute before and after the spring change (29 Mar 2026, 01:00 GMT → 02:00 BST)", () => {
    expect(utc("2026-03-29T00:59").utc.toISOString()).toBe("2026-03-29T00:59:00.000Z");
    expect(utc("2026-03-29T02:00").utc.toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });
  it("a time skipped by the spring change does not exist and is refused", () => {
    expect(londonWallTimeToUtc("2026-03-29T01:30")).toEqual({ ok: false, reason: "nonexistent" });
  });
  it("the repeated autumn hour (25 Oct 2026, 01:00–01:59) takes the first, BST, and says so", () => {
    const r = utc("2026-10-25T01:30");
    expect(r.utc.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(r.ambiguous).toBe(true);
    expect(utc("2026-10-25T02:00")).toEqual({ ok: true, utc: new Date("2026-10-25T02:00:00.000Z"), ambiguous: false });
    expect(utc("2026-10-25T00:59").ambiguous).toBe(false);
  });
  it("midnight on new year and leap day", () => {
    expect(utc("2027-01-01T00:00").utc.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(utc("2028-02-29T12:00").utc.toISOString()).toBe("2028-02-29T12:00:00.000Z");
  });
  it("refuses malformed or impossible dates", () => {
    for (const bad of ["", "2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01 10:00", "2026-01-01T24:00", "tomorrow"]) {
      expect(londonWallTimeToUtc(bad).ok).toBe(false);
    }
  });
});

describe("display", () => {
  it("shows London time with its zone, plus UTC", () => {
    expect(formatLondon("2026-07-15T08:00:00Z")).toMatch(/15 Jul 2026.*09:00 BST \(08:00 UTC\)/);
    expect(formatLondon("2026-01-15T09:00:00Z")).toMatch(/15 Jan 2026.*09:00 GMT \(09:00 UTC\)/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedFetch } from "../fetch";

/*
 * Found in staging QA: after connections died silently, a render waited on a
 * Supabase request that never settled and a child sat on "Saving…" for 15+
 * minutes. Every request must carry a deadline — except uploads.
 */
const seen: (RequestInit | undefined)[] = [];
afterEach(() => { seen.length = 0; vi.unstubAllGlobals(); });
const stub = () => vi.stubGlobal("fetch", vi.fn(async (_i: unknown, init?: RequestInit) => { seen.push(init); return new Response("{}"); }));

describe("boundedFetch", () => {
  it("gives every read a deadline", async () => {
    stub();
    await boundedFetch("https://x.supabase.co/rest/v1/missions", { method: "GET" });
    await boundedFetch("https://x.supabase.co/rest/v1/rpc/start_mission", { method: "POST" });
    await boundedFetch("https://x.supabase.co/storage/v1/object/sign/mission-resources/a.pdf", { method: "POST" });
    for (const init of seen) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("leaves uploads unbounded (a 20 MB Kit file may be slow)", async () => {
    stub();
    await boundedFetch("https://x.supabase.co/storage/v1/object/mission-resources/a.pdf", { method: "POST" });
    expect(seen[0]?.signal).toBeUndefined();
  });

  it("still honours the caller's own abort", async () => {
    stub();
    const c = new AbortController();
    await boundedFetch("https://x.supabase.co/rest/v1/x", { signal: c.signal });
    c.abort();
    expect(seen[0]?.signal?.aborted).toBe(true);
  });

  it("actually aborts a request that never answers, at the 20s deadline", async () => {
    vi.stubGlobal("fetch", vi.fn((_i: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))));
    const deadline = new AbortController();
    const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const p = boundedFetch("https://x.supabase.co/rest/v1/x").catch((e: Error) => e.message);
    expect(spy).toHaveBeenCalledWith(20_000);
    deadline.abort(); // the deadline passes
    expect(await p).toBe("aborted");
    spy.mockRestore();
  });
});

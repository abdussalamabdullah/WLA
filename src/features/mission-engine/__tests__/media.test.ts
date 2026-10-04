import { describe, expect, it } from "vitest";
import { assetKeysIn, resolveMedia, type ResolvedAsset } from "../media";
import { buildModel } from "../definition";
import { projectScreen } from "../projection";
import { emptyMissionState, type ScreenType } from "../schemas";
import { validateMission } from "../validator";

/*
 * F7 — media resolution and release gating, by behaviour.
 */

const now = new Date("2026-10-04T12:00:00Z");
const A = (key: string, kind: ResolvedAsset["kind"] = "image", extra: Partial<ResolvedAsset> = {}): ResolvedAsset =>
  ({ key, kind, url: `https://signed/${key}`, alt: `${key} alt`, longDescription: null, transcript: null, captionsUrl: null, ...extra });

const sc = (configuration: unknown, type = "content") =>
  ({ screenKey: "s", type: type as ScreenType, title: null, body: null, sequence: 1, configuration });

describe("assetKeysIn", () => {
  it("finds media blocks, comparisons, layers and asset: references", () => {
    const keys = assetKeysIn({
      media: [{ asset: "a", display: "before_after", compareWith: "b" }, { asset: "c", display: "layers", layers: [{ asset: "d", label: "D" }] }],
      image: { src: "asset:e", alt: "x" },
      background: { src: "/public.svg" },
      body: "asset:not a key",
    });
    expect(keys.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("resolveMedia", () => {
  const assets = new Map(["a", "b", "e"].map((k) => [k, A(k)]));
  const projected = (config: unknown) => ({ ...sc(config), view: {} });

  it("replaces asset: references with signed URLs", () => {
    const r = resolveMedia(projected({ image: { src: "asset:e", alt: "x" } }), assets);
    expect((r.configuration as { image: { src: string } }).image.src).toBe("https://signed/e");
  });

  it("drops a block whose asset is missing rather than showing it broken", () => {
    const r = resolveMedia(projected({ media: [{ asset: "a" }, { asset: "zz" }] }), assets);
    expect((r.configuration as { media: { asset: { key: string } }[] }).media.map((m) => m.asset.key)).toEqual(["a"]);
  });

  it("a before/after with no pair falls back to a single picture", () => {
    const r = resolveMedia(projected({ media: [{ asset: "a", display: "before_after", compareWith: "zz" }] }), assets);
    expect((r.configuration as { media: { display: string }[] }).media[0].display).toBe("inline");
  });
});

describe("release gating", () => {
  it("media behind a condition that does not hold is never requested", () => {
    const model = buildModel({
      definition: {},
      screens: [sc({ media: [{ asset: "open" }, { asset: "secret", when: { ref: { unlocked: "door" }, op: "exists" } }] })],
      completionRule: null,
    });
    const page = projectScreen(model, model.screens[0], emptyMissionState, now);
    expect(assetKeysIn(page.configuration)).toEqual(["open"]);
    const later = projectScreen(model, model.screens[0], { ...emptyMissionState, unlocked: ["door"] }, now);
    expect(assetKeysIn(later.configuration).sort()).toEqual(["open", "secret"]);
  });
});

describe("mission QA for media", () => {
  const model = (config: unknown) =>
    buildModel({ definition: { completion: { ref: { visited: "s" }, op: "exists" } }, screens: [sc(config), { ...sc({ message: "x" }, "completion"), screenKey: "end", sequence: 2 }], completionRule: null });
  const codes = (config: unknown, assets: { key: string; kind: string; alt_text?: string | null; transcript?: string | null; captions?: boolean }[]) =>
    validateMission(model(config), { assets }).issues.map((i) => i.code);

  it("an asset: reference to media the version does not have", () => {
    expect(codes({ next: "end", image: { src: "asset:ghost" } }, [])).toContain("missing_asset");
  });
  it("audio without a transcript and video without captions or transcript", () => {
    const c = codes({ next: "end", media: [{ asset: "clip" }, { asset: "film" }] }, [{ key: "clip", kind: "audio" }, { key: "film", kind: "video" }]);
    expect(c).toEqual(expect.arrayContaining(["missing_transcript", "missing_captions"]));
  });
  it("a complete set passes", () => {
    const c = codes({ next: "end", media: [{ asset: "pic", display: "zoom" }] }, [{ key: "pic", kind: "image", alt_text: "A bridge" }]);
    expect(c.filter((x) => /missing_|display_not/.test(x))).toEqual([]);
  });
});

describe("Mission Control audio assistance (Plan §8)", () => {
  it("a support item's audio is requested and resolved like any media", () => {
    const config = { support: [{ title: "Listen", body: "Hear it read aloud.", audio: "asset:help_audio" }] };
    expect(assetKeysIn(config)).toEqual(["help_audio"]);
    const r = resolveMedia({ ...sc(config), view: {} }, new Map([["help_audio", A("help_audio", "audio", { transcript: "Hear it." })]]));
    expect((r.configuration as { support: { audio: string }[] }).support[0].audio).toBe("https://signed/help_audio");
  });
});

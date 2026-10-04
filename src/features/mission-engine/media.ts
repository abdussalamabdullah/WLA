import type { ProjectedScreen } from "./projection";

/**
 * F7 — MEDIA RESOLUTION.
 *
 * Screens refer to media by asset KEY — in `media` blocks, and anywhere a
 * configuration string reads `asset:<key>` (a hotspot image, a map
 * background). Keys are resolved to short-lived signed URLs on the server,
 * for the projected CURRENT screen only and at the run's pinned version
 * (store.signMedia), so the page never learns where any other asset lives —
 * including one whose `when` does not hold, which the projection has already
 * removed (release gating).
 *
 * Pure: the caller supplies the resolved assets.
 */

export type ResolvedAsset = {
  key: string;
  kind: "image" | "diagram" | "map" | "animation" | "audio" | "video";
  url: string;
  alt: string | null;
  longDescription: string | null;
  transcript: string | null;
  captionsUrl: string | null;
};

export type MediaBlock = {
  display: "inline" | "zoom" | "before_after" | "layers";
  caption?: string;
  asset: ResolvedAsset;
  compareWith?: ResolvedAsset;
  labels?: [string, string];
  layers?: { label: string; asset: ResolvedAsset }[];
};

const REF = /^asset:([a-z][a-z0-9_]*)$/;

type RawBlock = { asset: string; caption?: string; display?: MediaBlock["display"]; compareWith?: string; labels?: [string, string]; layers?: { asset: string; label: string }[] };

/** Every asset key a configuration needs. */
export function assetKeysIn(config: unknown): string[] {
  const keys = new Set<string>();
  const walk = (v: unknown, inMedia = false) => {
    if (typeof v === "string") {
      const m = REF.exec(v);
      if (m) keys.add(m[1]);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, inMedia));
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (k === "media" && Array.isArray(x)) {
          for (const b of x as RawBlock[]) {
            keys.add(b.asset);
            if (b.compareWith) keys.add(b.compareWith);
            for (const l of b.layers ?? []) keys.add(l.asset);
          }
        } else walk(x, inMedia);
      }
    }
  };
  walk(config);
  return [...keys];
}

/** Replace keys with resolved assets. Blocks whose asset is missing are dropped, never shown broken. */
export function resolveMedia(screen: ProjectedScreen, assets: Map<string, ResolvedAsset>): ProjectedScreen {
  const swap = (v: unknown): unknown => {
    if (typeof v === "string") {
      const m = REF.exec(v);
      return m ? (assets.get(m[1])?.url ?? "") : v;
    }
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "media" ? x : swap(x)]));
    return v;
  };
  const config = swap(screen.configuration ?? {}) as Record<string, unknown>;
  const raw = Array.isArray((screen.configuration as { media?: unknown } | null)?.media)
    ? ((screen.configuration as { media: RawBlock[] }).media)
    : [];
  const media: MediaBlock[] = [];
  for (const b of raw) {
    const asset = assets.get(b.asset);
    if (!asset) continue;
    const block: MediaBlock = { display: b.display ?? "inline", caption: b.caption, asset };
    if (b.display === "before_after") {
      const other = b.compareWith ? assets.get(b.compareWith) : undefined;
      if (!other) { block.display = "inline"; } else { block.compareWith = other; block.labels = b.labels; }
    }
    if (b.display === "layers") {
      block.layers = (b.layers ?? []).flatMap((l) => (assets.get(l.asset) ? [{ label: l.label, asset: assets.get(l.asset)! }] : []));
    }
    media.push(block);
  }
  if (raw.length || media.length) config.media = media;
  return { ...screen, configuration: config };
}

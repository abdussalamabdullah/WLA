"use client";

import { useActionState, useId, useState } from "react";
import { deleteAssetAction, saveAssetAction, type AssetState } from "@/features/admin/asset-actions";
import type { ResolvedAsset } from "@/features/mission-engine/media";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormNotice } from "@/components/ui/field";

const initial: AssetState = {};

const KINDS = [
  { value: "image", label: "Image", accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml" },
  { value: "diagram", label: "Diagram", accept: "image/png,image/jpeg,image/webp,image/svg+xml" },
  { value: "map", label: "Map", accept: "image/png,image/jpeg,image/webp,image/svg+xml" },
  { value: "animation", label: "Animation", accept: "image/gif,image/webp,image/png" },
  { value: "audio", label: "Audio", accept: "audio/*" },
  { value: "video", label: "Video", accept: "video/mp4,video/webm" },
];

type Row = { key: string; kind: string; storage_path: string; captions_path: string | null };

/**
 * ASSET MANAGER (F7, Plan §12) — the media this version's screens show.
 *
 * Screens use an asset by key: a media block (`media: [{ asset: "key" }]`)
 * or anywhere an image source is asked for (`"asset:key"`). Distinct from the
 * Mission Kit, which is what the family prints and keeps.
 */
export function AssetManager({
  missionId,
  slug,
  version,
  rows,
  resolved,
}: {
  missionId: string;
  slug: string;
  version: number;
  rows: Row[];
  resolved: ResolvedAsset[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const byKey = new Map(resolved.map((a) => [a.key, a]));
  return (
    <section className="mt-[var(--space-2xl)]" aria-labelledby="media-assets">
      <h2 id="media-assets" className="text-[length:var(--text-h3)]">Media</h2>
      <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
        Pictures, diagrams, maps, sound and video that screens show. Use one on a screen by its key —
        a media block, or <code>&quot;asset:key&quot;</code> wherever a screen asks for an image.
      </p>

      {rows.length > 0 && (
        <ul className="mt-[var(--space-m)] flex flex-col gap-[var(--space-s)]">
          {rows.map((r) => {
            const a = byKey.get(r.key);
            return (
              <li key={r.key} className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
                <div className="flex flex-wrap items-start justify-between gap-[var(--space-s)]">
                  <div className="flex min-w-0 gap-[var(--space-m)]">
                    {a?.url && ["image", "diagram", "map", "animation"].includes(r.kind) && (
                      // eslint-disable-next-line @next/next/no-img-element -- signed draft media
                      <img src={a.url} alt="" className="h-[64px] w-[96px] shrink-0 rounded-[var(--radius-control)] object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="break-all font-medium"><code>{r.key}</code> · {r.kind}</p>
                      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                        {a?.alt ? `Text alternative: ${a.alt}` : ["image", "diagram", "map", "animation"].includes(r.kind) ? "No text alternative" : ""}
                        {r.kind === "audio" || r.kind === "video" ? `${a?.transcript ? "Transcript" : "No transcript"}${r.kind === "video" ? ` · ${r.captions_path ? "Captions" : "No captions"}` : ""}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-[var(--space-xs)]">
                    <button type="button" onClick={() => setEditing(editing === r.key ? null : r.key)}
                      className="min-h-[var(--target-min)] px-[var(--space-xs)] text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4">
                      {editing === r.key ? "Close" : "Edit"}
                    </button>
                    <form action={deleteAssetAction}>
                      <input type="hidden" name="missionId" value={missionId} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="version" value={version} />
                      <input type="hidden" name="key" value={r.key} />
                      <button type="submit" aria-label={`Remove media ${r.key}`}
                        className="min-h-[var(--target-min)] px-[var(--space-xs)] text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
                {editing === r.key && (
                  <div className="mt-[var(--space-m)] border-t border-[var(--color-border)] pt-[var(--space-m)]">
                    <AssetForm missionId={missionId} slug={slug} version={version} row={r} asset={a} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="mt-[var(--space-m)]">
        <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">Add media</summary>
        <div className="mt-[var(--space-m)]">
          <AssetForm missionId={missionId} slug={slug} version={version} />
        </div>
      </details>
    </section>
  );
}

function AssetForm({ missionId, slug, version, row, asset }: { missionId: string; slug: string; version: number; row?: Row; asset?: ResolvedAsset }) {
  const [state, action, pending] = useActionState(saveAssetAction, initial);
  const [kind, setKind] = useState(row?.kind ?? "image");
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const err = (k: string) => state.fieldErrors?.[k];
  const visual = ["image", "diagram", "map", "animation"].includes(kind);
  return (
    <form action={action} className="flex flex-col gap-[var(--space-m)]">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      {row && <input type="hidden" name="existingPath" value={row.storage_path} />}
      {row?.captions_path && <input type="hidden" name="existingCaptions" value={row.captions_path} />}
      {state.error && <FormError message={state.error} />}
      {state.ok && <FormNotice message="Media saved." />}

      <div className="grid gap-[var(--space-m)] sm:grid-cols-2">
        <Field label="Key" htmlFor={id("key")} error={err("key")} hint="Screens refer to it by this.">
          <Input id={id("key")} name="key" required defaultValue={row?.key ?? ""} readOnly={Boolean(row)} placeholder="bridge_photo" />
        </Field>
        <Field label="Kind" htmlFor={id("kind")} error={err("kind")}>
          <select id={id("kind")} name="kind" value={kind} onChange={(e) => setKind(e.target.value)}
            className="min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label={row ? "Replace the file (optional)" : "File"} htmlFor={id("file")} error={err("file")}>
        <input id={id("file")} name="file" type="file" accept={KINDS.find((k) => k.value === kind)?.accept}
          className="min-h-[var(--target-min)] text-[length:var(--text-label)]" />
      </Field>

      {visual && (
        <>
          <Field label="Text alternative" htmlFor={id("alt_text")} error={err("alt_text")} hint="What the picture shows, for a child who can't see it. Required.">
            <Input id={id("alt_text")} name="alt_text" defaultValue={asset?.alt ?? ""} />
          </Field>
          <Field label="Longer description (optional)" htmlFor={id("long_description")} error={err("long_description")} hint="For diagrams and maps whose detail matters.">
            <textarea id={id("long_description")} name="long_description" rows={3} defaultValue={asset?.longDescription ?? ""}
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]" />
          </Field>
        </>
      )}
      {(kind === "audio" || kind === "video") && (
        <Field label="Transcript" htmlFor={id("transcript")} error={err("transcript")} hint={kind === "audio" ? "Required for audio." : "Required unless the video has captions."}>
          <textarea id={id("transcript")} name="transcript" rows={5} defaultValue={asset?.transcript ?? ""}
            className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]" />
        </Field>
      )}
      {kind === "video" && (
        <Field label={row?.captions_path ? "Replace captions (.vtt, optional)" : "Captions (.vtt)"} htmlFor={id("captions")} error={err("captions")}>
          <input id={id("captions")} name="captions" type="file" accept=".vtt,text/vtt" className="min-h-[var(--target-min)] text-[length:var(--text-label)]" />
        </Field>
      )}
      <div>
        <Button type="submit" isLoading={pending} loadingLabel="Saving…">{row ? "Save media" : "Add media"}</Button>
      </div>
    </form>
  );
}

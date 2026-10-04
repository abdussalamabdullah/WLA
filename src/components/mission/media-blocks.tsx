"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { MediaBlock, ResolvedAsset } from "@/features/mission-engine/media";
import { cn } from "@/lib/utils";

/**
 * MEDIA BLOCKS (F7, Enhancement Plan §7).
 *
 * Every screen type shows its media the same way, under the body. Media is
 * object-led and quiet (UI/UX §14): no autoplay, no looping sound, controls
 * always visible. Every visual has its text alternative; audio has a
 * transcript; video has captions and/or a transcript. The validator blocks a
 * version that lacks them (validator.ts: missing_alt_text, missing_transcript,
 * missing_captions), so they are guaranteed here rather than optional.
 */

const visual = (a: ResolvedAsset) => a.kind === "image" || a.kind === "diagram" || a.kind === "map" || a.kind === "animation";

function LongDescription({ asset }: { asset: ResolvedAsset }) {
  if (!asset.longDescription) return null;
  return (
    <details className="mt-[var(--space-xs)]">
      <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4">
        Describe this {asset.kind === "map" ? "map" : asset.kind === "diagram" ? "diagram" : "picture"}
      </summary>
      <p className="wla-measure mt-[var(--space-xs)]">{asset.longDescription}</p>
    </details>
  );
}

function Transcript({ asset }: { asset: ResolvedAsset }) {
  if (!asset.transcript) return null;
  return (
    <details className="mt-[var(--space-xs)]">
      <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4">
        Read the transcript
      </summary>
      <div className="wla-measure mt-[var(--space-xs)] flex flex-col gap-[var(--space-s)]">
        {asset.transcript.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </details>
  );
}

function Img({ asset, className }: { asset: ResolvedAsset; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived mission media
    <img src={asset.url} alt={asset.alt ?? ""} className={cn("block h-auto w-full rounded-[var(--radius-surface)]", className)} />
  );
}

function Zoom({ asset }: { asset: ResolvedAsset }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="mt-[var(--space-xs)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4">
        See it larger
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgb(58_47_42/0.24)]" />
        <Dialog.Content className="fixed inset-[var(--space-m)] flex flex-col overflow-auto rounded-[var(--radius-dialog)] bg-[var(--color-surface)] p-[var(--space-m)] shadow-[var(--shadow-overlay)]">
          <Dialog.Title className="sr-only">{asset.alt ?? "Larger view"}</Dialog.Title>
          <Dialog.Description className="sr-only">The same picture, larger. Scroll to move around it.</Dialog.Description>
          {/* Natural size, scrollable: pinch-zoom still works on touch. */}
          <div className="flex-1 overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed mission media */}
            <img src={asset.url} alt={asset.alt ?? ""} className="max-w-none" />
          </div>
          <Dialog.Close className="mt-[var(--space-m)] inline-flex min-h-[var(--target-min)] items-center self-start rounded-[var(--radius-button)] border border-[var(--color-border-strong)] px-[var(--space-l)] text-[length:var(--text-label)]">
            Back to the mission
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BeforeAfter({ block }: { block: MediaBlock }) {
  const [after, setAfter] = useState(false);
  const labels = block.labels ?? ["Before", "After"];
  const shown = after ? block.compareWith! : block.asset;
  return (
    <div className="flex flex-col gap-[var(--space-s)]">
      <div role="radiogroup" aria-label="Which to show" className="flex gap-[var(--space-xs)]">
        {labels.map((l, i) => {
          const on = (i === 1) === after;
          return (
            <button key={l} type="button" role="radio" aria-checked={on} onClick={() => setAfter(i === 1)}
              className={cn("inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-xs)] rounded-[var(--radius-control)] border px-[var(--space-m)] text-[length:var(--text-label)]",
                on ? "border-[var(--color-primary)] bg-[var(--color-surface-sage)] font-medium" : "border-[var(--color-border)] bg-[var(--color-surface)]")}>
              {on && <span aria-hidden>✓</span>}{l}
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">Showing {after ? labels[1] : labels[0]}</p>
      <Img asset={shown} />
      <LongDescription asset={shown} />
    </div>
  );
}

function Layers({ block }: { block: MediaBlock }) {
  const [on, setOn] = useState<boolean[]>(() => (block.layers ?? []).map(() => true));
  return (
    <div className="flex flex-col gap-[var(--space-s)]">
      <div className="relative">
        <Img asset={block.asset} />
        {(block.layers ?? []).map((l, i) =>
          on[i] ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed mission media
            <img key={l.asset.key} src={l.asset.url} alt="" aria-hidden className="absolute inset-0 h-full w-full rounded-[var(--radius-surface)] object-contain" />
          ) : null,
        )}
      </div>
      <fieldset className="flex flex-wrap gap-[var(--space-m)]">
        <legend className="sr-only">Layers</legend>
        {(block.layers ?? []).map((l, i) => (
          <label key={l.asset.key} className="inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-xs)]">
            <input type="checkbox" checked={on[i]} onChange={() => setOn(on.map((x, j) => (j === i ? !x : x)))} className="h-5 w-5 accent-[var(--color-primary)]" />
            {l.label}{l.asset.alt ? <span className="sr-only">: {l.asset.alt}</span> : null}
          </label>
        ))}
      </fieldset>
      <LongDescription asset={block.asset} />
    </div>
  );
}

function One({ block }: { block: MediaBlock }) {
  const a = block.asset;
  if (block.display === "before_after" && block.compareWith && visual(a)) return <BeforeAfter block={block} />;
  if (block.display === "layers" && block.layers?.length && visual(a)) return <Layers block={block} />;
  if (a.kind === "audio") {
    return (
      <div>
        <audio controls preload="none" src={a.url} className="w-full max-w-[32rem]" aria-label={block.caption ?? a.alt ?? "Audio"} />
        <Transcript asset={a} />
      </div>
    );
  }
  if (a.kind === "video") {
    return (
      <div>
        <video controls preload="metadata" src={a.url} className="block h-auto w-full rounded-[var(--radius-surface)]" aria-label={block.caption ?? a.alt ?? "Video"}>
          {a.captionsUrl && <track kind="captions" src={a.captionsUrl} srcLang="en" label="English" default />}
        </video>
        <Transcript asset={a} />
      </div>
    );
  }
  return (
    <div>
      <Img asset={a} />
      {block.display === "zoom" && <Zoom asset={a} />}
      <LongDescription asset={a} />
    </div>
  );
}

export function MediaBlocks({ blocks }: { blocks?: MediaBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="flex max-w-[44rem] flex-col gap-[var(--space-l)]">
      {blocks.map((b, i) => (
        <figure key={`${b.asset.key}-${i}`} className="flex flex-col gap-[var(--space-xs)]">
          <One block={b} />
          {b.caption && <figcaption className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{b.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

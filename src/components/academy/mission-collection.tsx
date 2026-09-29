"use client";

import { useMemo, useState, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { MissionStatus, WlaLab } from "@/types/database";

/**
 * MY MISSIONS AT SCALE — LMS brief §8, §9. Supersedes the search/filter
 * prohibition by written approval (D-60).
 *
 * Everything here filters a collection the SERVER already scoped to one child.
 * No control in this component can widen what was fetched: there is no child
 * id, no mission id and no query sent anywhere. Filtering is a view over data
 * the actor was already entitled to see, which is why it is safe to do in the
 * browser and why "filters operate only against the selected child" is true by
 * construction rather than by remembering to pass a parameter.
 *
 * Status is never carried by colour alone (Architecture §20): every status
 * pill states its status in words.
 */

export type CollectionItem = {
  slug: string;
  title: string;
  lab: WlaLab;
  labLabel: string;
  minAge: number;
  maxAge: number;
  coverImage: string | null;
  status: MissionStatus;
  lastActivityAt: string | null;
};

const STATUS_LABEL: Record<MissionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

/** Architecture §4 — the locked status/action pairing. */
const STATUS_ACTION: Record<MissionStatus, string> = {
  not_started: "Start Mission",
  in_progress: "Continue Mission",
  complete: "View Mission",
};

type Tab = "all" | MissionStatus;

const AGE_BANDS = [
  { id: "7-11", label: "Ages 7–11", min: 7, max: 11 },
  { id: "11-15", label: "Ages 11–15", min: 11, max: 15 },
] as const;

function StatusPill({ status }: { status: MissionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] rounded-[var(--radius-control)]",
        "px-[var(--space-xs)] py-[3px] text-[length:var(--text-small)]",
        "border",
        status === "complete"
          ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sage)]"
          : status === "in_progress"
            ? "border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)]",
      )}
    >
      {status === "complete" && (
        <svg viewBox="0 0 16 16" className="size-[12px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m3 8.5 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The mission photograph.
 *
 * `next/image` rather than a bare <img>: this grid renders up to four across
 * and twenty down, so unoptimised full-size photographs would be the page's
 * whole weight.
 *
 * NO STAND-IN when a mission has no artwork (D-39). A tinted panel at the
 * image's aspect ratio was tried on the previous card and rejected on sight:
 * beside a real photograph it is the louder of the two, which is what a
 * placeholder that size always becomes. A mission without a cover is
 * title-led until its artwork exists — so this renders nothing at all.
 *
 * `alt=""` is deliberate and is NOT the undescribed-image defect found during
 * staging QA. That one was Mission Home's hero, which stands alone. Here the
 * title sits immediately beneath the image inside the same link, so describing
 * the photograph would make a screen reader announce the mission twice.
 */
function Cover({ src }: { src: string | null }) {
  if (!src) return null;
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-surface)]">
      <Image
        src={src}
        alt=""
        fill
        sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
        className="object-cover"
      />
    </div>
  );
}

/** §9 — compact card: image, title, lab, age range, status, one action. */
function MissionCard({ item }: { item: CollectionItem }) {
  return (
    <li className="flex flex-col">
      <Link
        href={`/academy/missions/${item.slug}`}
        className={cn(
          "group flex h-full flex-col gap-[var(--space-s)]",
          "rounded-[var(--radius-surface)] border border-[var(--color-border)]",
          "bg-[var(--color-surface)] p-[var(--space-s)]",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:border-[var(--color-border-strong)]",
        )}
      >
        {item.coverImage && <Cover src={item.coverImage} />}

        <div className="flex flex-1 flex-col gap-[var(--space-xs)]">
          <h3 className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)] leading-tight">
            {item.title}
          </h3>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {item.labLabel}
            <br />
            Ages {item.minAge}–{item.maxAge}
          </p>
          <div className="mt-[var(--space-xs)]">
            <StatusPill status={item.status} />
          </div>
        </div>

        <span
          className={cn(
            "mt-[var(--space-xs)] inline-flex min-h-[var(--target-min)] items-center justify-center",
            "rounded-[var(--radius-button)] bg-[var(--color-primary)] px-[var(--space-m)]",
            "text-[length:var(--text-label)] font-medium text-[color:var(--color-primary-text)]",
            "transition-colors group-hover:bg-[var(--color-primary-hover)]",
          )}
        >
          {STATUS_ACTION[item.status]}
        </span>
      </Link>
    </li>
  );
}

export function MissionCollection({ items }: { items: CollectionItem[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [lab, setLab] = useState<string>("all");
  const [age, setAge] = useState<string>("all");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: items.length,
      not_started: 0,
      in_progress: 0,
      complete: 0,
    };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);

  const labs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) seen.set(i.lab, i.labLabel);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (tab !== "all" && i.status !== tab) return false;
      if (lab !== "all" && i.lab !== lab) return false;
      if (age !== "all") {
        const band = AGE_BANDS.find((b) => b.id === age);
        // Overlap, not containment: a 7–15 mission belongs in both bands.
        if (band && (i.maxAge < band.min || i.minAge > band.max)) return false;
      }
      if (q && !(`${i.title} ${i.labLabel}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, tab, lab, age, query]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "not_started", label: "Not started" },
    { id: "in_progress", label: "In progress" },
    { id: "complete", label: "Complete" },
  ];

  const showFilters = items.length > 3;

  return (
    <section className="mt-[var(--space-xl)]">
      <h2 className="text-[length:var(--text-h1)]">
        Your Missions{" "}
        <span className="text-[var(--color-text-muted)]">({items.length})</span>
      </h2>

      {/* ------------------------------------------------------------ tabs */}
      <div
        role="tablist"
        aria-label="Filter missions by status"
        className="mt-[var(--space-m)] flex flex-wrap gap-[var(--space-xs)]"
      >
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-button)]",
                "border px-[var(--space-m)] text-[length:var(--text-label)]",
                "transition-colors duration-[var(--duration-fast)]",
                selected
                  ? "border-transparent bg-[var(--color-surface-sage)] font-medium text-[color:var(--color-text)]"
                  : "border-[var(--color-border)] text-[color:var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[color:var(--color-text)]",
              )}
            >
              {t.label} ({counts[t.id]})
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------- filters */}
      {showFilters && (
        <div className="mt-[var(--space-m)] flex flex-wrap items-end gap-[var(--space-m)]">
          <div className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
            <label htmlFor={searchId} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Search
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search missions"
              className={cn(
                "min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)]",
                "bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
              )}
            />
          </div>

          <Select label="Lab" value={lab} onChange={setLab}
            options={[{ value: "all", label: "All labs" },
              ...labs.map(([v, l]) => ({ value: v, label: l }))]} />

          <Select label="Age" value={age} onChange={setAge}
            options={[{ value: "all", label: "All ages" },
              ...AGE_BANDS.map((b) => ({ value: b.id, label: b.label }))]} />
        </div>
      )}

      {/* ----------------------------------------------------------- grid */}
      {filtered.length === 0 ? (
        <p className="mt-[var(--space-xl)] wla-measure text-[var(--color-text-muted)]">
          {items.length === 0
            ? "You don't have any missions yet."
            : "No missions match those filters."}
        </p>
      ) : (
        <ul
          className={cn(
            "mt-[var(--space-l)] grid gap-[var(--space-m)]",
            "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          )}
        >
          {filtered.map((i) => (
            <MissionCard key={i.slug} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)]",
          "bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

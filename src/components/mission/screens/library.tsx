"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PrimaryAction, ScreenFrame, SelectableOption } from "./shared";
import { parseScreenConfig, type ScreenComponentProps } from "@/features/mission-engine";
import type { MissionScreen } from "@/features/mission-engine/navigation";
import { cn } from "@/lib/utils";
import { CameraScan } from "./device";

/**
 * THE INTERACTION LIBRARY — components (Enhancement Plan §4, D-86).
 *
 * One component per library type, each generic: everything it shows arrives
 * as projected configuration, and everything it does is one `submit` whose
 * value the server checks (interactions/contracts.ts). Answers never reach
 * this file — the projection removes them.
 *
 * One interaction language: the same frame, the same calm primary action,
 * selection shown in words as well as border and fill (Architecture §20), 44px
 * targets, and nothing that needs hover, a precise pointer or dragging.
 * Dragging is offered where it helps a mouse user, never required: every
 * arrangement can also be made by tapping or with the keyboard.
 */

type Props = ScreenComponentProps;

/** Fields the server adds to a projection that the type's schema does not describe. */
const extra = <T,>(screen: MissionScreen, key: string): T | undefined =>
  (screen.configuration as Record<string, unknown> | null)?.[key] as T | undefined;

/** A stable shuffle per screen, so authored order never gives an answer away. */
function stableShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  // A shuffle that lands on the original order is no shuffle.
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift()!);
  return out;
}

function LibFrame({
  screen,
  prompt,
  instruction,
  missionControl,
  error,
  isPending,
  label,
  disabled,
  onSubmit,
  onAdvance,
  secondary,
  children,
}: {
  screen: MissionScreen;
  prompt: string;
  instruction?: string;
  missionControl: { title: string; body: string }[];
  error?: string;
  isPending: boolean;
  label: string;
  disabled?: boolean;
  onSubmit: () => void;
  onAdvance: Props["onAdvance"];
  secondary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      instruction={instruction}
      missionControl={missionControl}
      error={error}
      action={
        <>
          <PrimaryAction label={label} onClick={onSubmit} disabled={disabled} isPending={isPending} />
          {secondary}
          {screen.view?.canRetry && (
            <Button type="button" variant="text" onClick={() => onAdvance({ kind: "retry", screenKey: screen.screenKey })}>
              Start this step again
            </Button>
          )}
        </>
      }
    >
      {/*
        The prompt is the screen's heading when the screen has no title, so
        sections below it (h3) never skip a level after the mission's h1.
      */}
      {screen.title ? (
        <p className="wla-measure font-medium">{prompt}</p>
      ) : (
        <h2 className="wla-measure text-[length:var(--text-h3)]">{prompt}</h2>
      )}
      {children}
    </ScreenFrame>
  );
}

const submit = (p: Props, value: unknown) => p.onAdvance({ kind: "submit", screenKey: p.screen.screenKey, value });

/** A small, quiet control button (44px). */
function SmallButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)]",
        "hover:border-[var(--color-border-strong)] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A row of mutually exclusive choices, read as a radio group. */
function Segmented({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string | undefined; onChange: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-[var(--space-xs)]">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-xs)] rounded-[var(--radius-control)] border px-[var(--space-m)] text-[length:var(--text-label)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
              on ? "border-[var(--color-primary)] bg-[var(--color-surface-sage)] font-medium" : "border-[var(--color-border)] bg-[var(--color-surface)]",
            )}
          >
            {on && <span aria-hidden>✓</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------- entry ----

export function NumericEntryScreen(p: Props) {
  const c = parseScreenConfig("numeric_entry", p.screen.configuration);
  const [raw, setRaw] = useState("");
  const n = raw.trim() === "" ? NaN : Number(raw.replace(",", "."));
  const id = `num-${p.screen.screenKey}`;
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Enter"} disabled={!Number.isFinite(n)} onSubmit={() => submit(p, n)} onAdvance={p.onAdvance}>
      <div className="max-w-[20rem]">
        <Field label={c.unit ? `${c.label} (${c.unit})` : c.label} htmlFor={id}
          hint={c.min !== undefined && c.max !== undefined ? `From ${c.min} to ${c.max}.` : undefined}>
          <Input id={id} inputMode={c.decimals ? "decimal" : "numeric"} autoComplete="off" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </Field>
      </div>
    </LibFrame>
  );
}

export function CodeEntryScreen(p: Props) {
  const c = parseScreenConfig("code_entry", p.screen.configuration);
  const [v, setV] = useState("");
  const id = `code-${p.screen.screenKey}`;
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Check"} disabled={!v.trim()} onSubmit={() => submit(p, v)} onAdvance={p.onAdvance}>
      <div className="max-w-[28rem]">
        <Field label={c.label} htmlFor={id} hint={c.hint}>
          <Input id={id} value={v} maxLength={c.maxLength} inputMode={c.inputMode} autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) submit(p, v); }} />
        </Field>
      </div>
      {c.scan && <CameraScan onRead={(text) => setV(text.slice(0, c.maxLength))} />}
    </LibFrame>
  );
}

export function TokenSequenceScreen(p: Props) {
  const c = parseScreenConfig("token_sequence", p.screen.configuration);
  const [seq, setSeq] = useState<string[]>([]);
  const label = (id: string) => c.tokens.find((t) => t.id === id);
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Check"} disabled={seq.length !== c.length} onSubmit={() => submit(p, seq)} onAdvance={p.onAdvance}>
      <ol aria-label={`Your sequence, ${seq.length} of ${c.length}`} className="flex flex-wrap gap-[var(--space-xs)]">
        {Array.from({ length: c.length }, (_, i) => {
          const t = seq[i] ? label(seq[i]) : null;
          return (
            <li key={i} className={cn("flex min-h-[56px] min-w-[56px] flex-col items-center justify-center rounded-[var(--radius-control)] border px-[var(--space-xs)]",
              t ? "border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]" : "border-dashed border-[var(--color-border)]")}>
              {t ? (<><span aria-hidden className="text-[length:var(--text-h3)]">{t.symbol ?? t.label}</span><span className="text-[length:var(--text-small)]">{t.label}</span></>)
                : <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{i + 1}<span className="sr-only">: empty</span></span>}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-[var(--space-xs)]" aria-label="Symbols">
        {c.tokens.map((t) => (
          <SmallButton key={t.id} disabled={seq.length >= c.length || (!c.allowRepeats && seq.includes(t.id))} onClick={() => setSeq([...seq, t.id])} aria-label={`Add ${t.label}`}>
            <span aria-hidden className="mr-[var(--space-xs)] text-[length:var(--text-h3)]">{t.symbol}</span>{t.label}
          </SmallButton>
        ))}
      </div>
      <div className="flex gap-[var(--space-s)]">
        <SmallButton disabled={!seq.length} onClick={() => setSeq(seq.slice(0, -1))}>Remove last</SmallButton>
        <SmallButton disabled={!seq.length} onClick={() => setSeq([])}>Clear</SmallButton>
      </div>
    </LibFrame>
  );
}

// ---------------------------------------------------------- arrange ----

export function ArrangeScreen(p: Props) {
  const c = parseScreenConfig("arrange", p.screen.configuration);
  const initial = useMemo(() => stableShuffle(c.items.map((x) => x.id), p.screen.screenKey), [c.items, p.screen.screenKey]);
  const [order, setOrder] = useState<string[]>(initial);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const item = (id: string) => c.items.find((x) => x.id === id)!;

  if (c.mode === "sort") {
    const placed = Object.keys(groups).length;
    return (
      <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
        label={c.actionLabel ?? "Done"} disabled={c.requireAll ? placed !== c.items.length : placed === 0} onSubmit={() => submit(p, groups)} onAdvance={p.onAdvance}>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]" aria-live="polite">{placed} of {c.items.length} placed</p>
        <ul className="flex flex-col gap-[var(--space-m)]">
          {initial.map((id) => (
            <li key={id} className="flex flex-col gap-[var(--space-xs)] border-b border-[var(--color-border)] pb-[var(--space-m)]">
              <span className="font-medium">{item(id).label}</span>
              {item(id).description && <span className="text-[var(--color-text-muted)]">{item(id).description}</span>}
              <Segmented label={`Group for ${item(id).label}`} options={c.groups} value={groups[id]} onChange={(g) => setGroups({ ...groups, [id]: g })} />
            </li>
          ))}
        </ul>
      </LibFrame>
    );
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
  };
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Done"} onSubmit={() => submit(p, order)} onAdvance={p.onAdvance}>
      {c.ends && <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Top: {c.ends[0]} · Bottom: {c.ends[1]}</p>}
      <ol className="flex flex-col gap-[var(--space-xs)]" aria-label={c.mode === "rank" ? "Your ranking" : "Your order"}>
        {order.map((id, i) => (
          <li
            key={id}
            draggable
            onDragStart={() => setDragging(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragging) move(order.indexOf(dragging), i); setDragging(null); }}
            className="flex items-center gap-[var(--space-s)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-m)] py-[var(--space-xs)]"
          >
            <span className="w-[2ch] text-[var(--color-text-muted)]">{i + 1}</span>
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{item(id).label}</span>
              {item(id).description && <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{item(id).description}</span>}
            </span>
            <SmallButton aria-label={`Move ${item(id).label} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</SmallButton>
            <SmallButton aria-label={`Move ${item(id).label} down`} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>↓</SmallButton>
          </li>
        ))}
      </ol>
    </LibFrame>
  );
}

export function MatchingScreen(p: Props) {
  const c = parseScreenConfig("matching", p.screen.configuration);
  const right = useMemo(() => stableShuffle(c.right, p.screen.screenKey), [c.right, p.screen.screenKey]);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const used = new Set(Object.values(pairs));
  const count = Object.keys(pairs).length;
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Done"} disabled={c.requireAll ? count !== c.left.length : count === 0} onSubmit={() => submit(p, pairs)} onAdvance={p.onAdvance}>
      <ul className="flex flex-col gap-[var(--space-m)]">
        {c.left.map((l) => {
          const id = `match-${p.screen.screenKey}-${l.id}`;
          return (
            <li key={l.id} className="flex flex-col gap-[var(--space-xs)]">
              <label htmlFor={id} className="font-medium">{l.label}</label>
              <select
                id={id}
                value={pairs[l.id] ?? ""}
                onChange={(e) => {
                  const next = { ...pairs };
                  if (e.target.value) next[l.id] = e.target.value; else delete next[l.id];
                  setPairs(next);
                }}
                className="min-h-[var(--target-min)] w-full max-w-[28rem] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              >
                <option value="">Choose…</option>
                {right.map((r) => (
                  <option key={r.id} value={r.id} disabled={c.oneToOne && used.has(r.id) && pairs[l.id] !== r.id}>
                    {r.label}{c.oneToOne && used.has(r.id) && pairs[l.id] !== r.id ? " (used)" : ""}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </LibFrame>
  );
}

// -------------------------------------------------------- quantities ----

type Control = { id: string; label: string; min: number; max: number; step: number; default?: number; unit?: string; ends?: [string, string] };

function Slider({ c, value, onChange, idBase }: { c: Control; value: number; onChange: (n: number) => void; idBase: string }) {
  const id = `${idBase}-${c.id}`;
  return (
    <div className="flex flex-col gap-[var(--space-xs)]">
      <label htmlFor={id} className="flex justify-between font-medium">
        <span>{c.label}</span>
        <output htmlFor={id}>{value}{c.unit ? ` ${c.unit}` : ""}</output>
      </label>
      <input id={id} type="range" min={c.min} max={c.max} step={c.step} value={value}
        aria-valuetext={`${value}${c.unit ? ` ${c.unit}` : ""}${c.ends ? ` (${c.ends[0]} to ${c.ends[1]})` : ""}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-[var(--target-min)] w-full accent-[var(--color-primary)]" />
      {c.ends && (
        <span className="flex justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]"><span>{c.ends[0]}</span><span>{c.ends[1]}</span></span>
      )}
      <span className="flex gap-[var(--space-xs)]">
        <SmallButton aria-label={`Less ${c.label}`} disabled={value <= c.min} onClick={() => onChange(Math.max(c.min, +(value - c.step).toFixed(6)))}>−</SmallButton>
        <SmallButton aria-label={`More ${c.label}`} disabled={value >= c.max} onClick={() => onChange(Math.min(c.max, +(value + c.step).toFixed(6)))}>+</SmallButton>
      </span>
    </div>
  );
}

const defaults = (controls: Control[]) => Object.fromEntries(controls.map((x) => [x.id, x.default ?? x.min]));

export function AllocateScreen(p: Props) {
  const c = parseScreenConfig("allocate", p.screen.configuration);
  const [v, setV] = useState<Record<string, number>>(() => defaults(c.controls));
  const sum = Object.values(v).reduce((a, b) => a + b, 0);
  const budgeted = c.mode !== "sliders" && c.total !== undefined;
  const over = budgeted && sum > c.total!;
  const short = budgeted && c.exact && sum < c.total!;
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Done"} disabled={over || short} onSubmit={() => submit(p, v)} onAdvance={p.onAdvance}>
      {budgeted && (
        <p aria-live="polite" className="font-medium">
          {sum} of {c.total} {c.totalLabel ?? ""} used{over ? " — that is more than you have" : short ? ` — ${c.total! - sum} left to place` : ""}
        </p>
      )}
      <div className="flex max-w-[32rem] flex-col gap-[var(--space-l)]">
        {c.controls.map((x) => (
          <Slider key={x.id} c={x} idBase={p.screen.screenKey} value={v[x.id]} onChange={(n) => setV({ ...v, [x.id]: n })} />
        ))}
      </div>
    </LibFrame>
  );
}

export function InventoryScreen(p: Props) {
  const c = parseScreenConfig("inventory", p.screen.configuration);
  const previous = extra<string[]>(p.screen, "carried") ?? [];
  const [chosen, setChosen] = useState<string[]>(() => previous.filter((x) => c.items.some((i) => i.id === x)));
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < c.max ? [...chosen, id] : chosen);
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Take these"} disabled={chosen.length < c.min} onSubmit={() => submit(p, chosen)} onAdvance={p.onAdvance}>
      <p aria-live="polite" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{chosen.length} of {c.max} chosen</p>
      <div className="flex flex-col gap-[var(--space-s)]">
        {c.items.map((i) => (
          <SelectableOption key={i.id} label={i.label} description={i.description} selected={chosen.includes(i.id)} selectedLabel="Taking"
            disabled={!chosen.includes(i.id) && chosen.length >= c.max} onSelect={() => toggle(i.id)} />
        ))}
      </div>
    </LibFrame>
  );
}

export function SimulationScreen(p: Props) {
  const c = parseScreenConfig("simulation", p.screen.configuration);
  const current = extra<{ runs: number; values: Record<string, number> | null; readouts: string[] }>(p.screen, "current") ?? { runs: 0, values: null, readouts: [] };
  const [v, setV] = useState<Record<string, number>>(() => current.values ?? defaults(c.controls));
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Continue"} disabled={current.runs < c.minRuns} onSubmit={() => submit(p, { action: "done" })} onAdvance={p.onAdvance}
      secondary={<Button type="button" variant="secondary" onClick={() => submit(p, { action: "run", values: v })} disabled={p.isPending}>{c.runLabel}</Button>}>
      <div className="flex max-w-[32rem] flex-col gap-[var(--space-l)]">
        {c.controls.map((x) => (
          <Slider key={x.id} c={x} idBase={p.screen.screenKey} value={v[x.id]} onChange={(n) => setV({ ...v, [x.id]: n })} />
        ))}
      </div>
      <section aria-live="polite" aria-label="What happened" className="wla-measure rounded-[var(--radius-surface)] bg-[var(--color-surface-raised)] p-[var(--space-m)]">
        {current.runs === 0 ? (
          <p className="text-[var(--color-text-muted)]">Set it up, then {c.runLabel.toLowerCase()}.</p>
        ) : (
          <>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Run {current.runs}</p>
            {current.readouts.map((r, i) => <p key={i}>{r}</p>)}
          </>
        )}
      </section>
    </LibFrame>
  );
}

// --------------------------------------------------------- judgement ----

export function CompareScreen(p: Props) {
  const c = parseScreenConfig("compare", p.screen.configuration);
  const [pick, setPick] = useState<string | undefined>();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const scale = c.scale.map((label, i) => ({ id: String(i), label }));
  const rated = Object.keys(ratings).length === c.options.length * c.criteria.length;
  const ready = (!c.pick || pick) && (c.mode !== "matrix" || rated);
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Continue"} disabled={!ready} onAdvance={p.onAdvance}
      onSubmit={() => submit(p, { pick, ratings: c.mode === "matrix" ? ratings : undefined })}>
      {/* By criterion, not a wide table: nothing scrolls sideways on a phone. */}
      <div className="flex flex-col gap-[var(--space-l)]">
        {c.criteria.map((cr) => (
          <section key={cr.id} aria-labelledby={`cr-${p.screen.screenKey}-${cr.id}`}>
            <h3 id={`cr-${p.screen.screenKey}-${cr.id}`} className="text-[length:var(--text-h3)]">{cr.label}</h3>
            {cr.description && <p className="text-[var(--color-text-muted)]">{cr.description}</p>}
            <div className="mt-[var(--space-s)] grid gap-[var(--space-s)] sm:grid-cols-2">
              {c.options.map((o) => (
                <div key={o.id} className="flex flex-col gap-[var(--space-xs)] border-l-2 border-[var(--color-border)] pl-[var(--space-m)]">
                  <span className="font-medium">{o.label}</span>
                  {c.mode === "comparison" ? (
                    <span>{c.cells[`${o.id}.${cr.id}`] ?? "—"}</span>
                  ) : (
                    <Segmented label={`${o.label}: ${cr.label}`} options={scale}
                      value={ratings[`${o.id}.${cr.id}`] === undefined ? undefined : String(ratings[`${o.id}.${cr.id}`])}
                      onChange={(i) => setRatings({ ...ratings, [`${o.id}.${cr.id}`]: Number(i) })} />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {c.pick && (
        <fieldset className="flex flex-col gap-[var(--space-s)]">
          <legend className="mb-[var(--space-s)] font-medium">{c.pickPrompt ?? "Which will you choose?"}</legend>
          {c.options.map((o) => (
            <SelectableOption key={o.id} label={o.label} description={o.description} selected={pick === o.id} onSelect={() => setPick(o.id)} />
          ))}
        </fieldset>
      )}
    </LibFrame>
  );
}

// ------------------------------------------------------------ visual ----

export function HotspotScreen(p: Props) {
  const c = parseScreenConfig("hotspot", p.screen.configuration);
  const [chosen, setChosen] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const annotate = c.mode === "annotate";
  const toggle = (id: string) => {
    if (annotate) { setNotes(id in notes ? notes : { ...notes, [id]: "" }); return; }
    setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < c.maxSelect ? [...chosen, id] : c.maxSelect === 1 ? [id] : chosen);
  };
  const filled = Object.values(notes).filter((n) => n.trim()).length;
  const on = (id: string) => (annotate ? id in notes : chosen.includes(id));
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Done"} disabled={annotate ? filled < c.minSelect : chosen.length < c.minSelect} onAdvance={p.onAdvance}
      onSubmit={() => submit(p, annotate ? Object.fromEntries(Object.entries(notes).filter(([, n]) => n.trim())) : chosen)}>
      <figure className="relative w-full max-w-[40rem]">
        {/* eslint-disable-next-line @next/next/no-img-element -- mission media, sized by the author */}
        <img src={c.image.src} alt={c.image.alt} className="block h-auto w-full rounded-[var(--radius-surface)]" />
        {/* Visual targets for pointing. The named list below is the accessible control. */}
        {c.regions.map((r) => (
          <button key={r.id} type="button" tabIndex={-1} aria-hidden onClick={() => toggle(r.id)}
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
            className={cn("absolute rounded-[var(--radius-control)] border-2", on(r.id) ? "border-[3px] border-[var(--color-primary)]" : "border-transparent")} />
        ))}
      </figure>
      <div className="flex flex-col gap-[var(--space-s)]">
        {c.regions.map((r) => (
          <div key={r.id} className="flex flex-col gap-[var(--space-xs)]">
            <SelectableOption label={r.label} selected={on(r.id)} selectedLabel={annotate ? "Noting" : "Chosen"} onSelect={() => toggle(r.id)} />
            {annotate && r.id in notes && (
              <label className="flex flex-col gap-[var(--space-xs)] pl-[var(--space-m)]">
                <span className="text-[length:var(--text-small)]">Your note on {r.label}</span>
                <textarea rows={2} maxLength={c.noteMaxLength} value={notes[r.id]} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]" />
              </label>
            )}
          </div>
        ))}
      </div>
    </LibFrame>
  );
}

export function SketchScreen(p: Props) {
  const c = parseScreenConfig("sketch", p.screen.configuration);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const drawing = useRef<number[] | null>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.strokeStyle = getComputedStyle(el).color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      ctx.beginPath();
      for (let i = 0; i < s.length; i += 2) {
        const x = (s[i] / 1000) * el.width, y = (s[i + 1] / 1000) * el.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [strokes]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)].map((n) => Math.max(0, Math.min(1000, n)));
  };
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Done"} disabled={!strokes.length} onSubmit={() => submit(p, { strokes })} onAdvance={p.onAdvance}
      secondary={<Button type="button" variant="text" onClick={() => submit(p, "paper")}>I drew it on paper</Button>}>
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{c.paperAlternative}</p>
      <canvas
        ref={canvas}
        width={800}
        height={500}
        role="img"
        aria-label={`Drawing area. ${strokes.length} line${strokes.length === 1 ? "" : "s"} drawn.`}
        className="block w-full max-w-[40rem] touch-none rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
        onPointerDown={(e) => {
          if (strokes.length >= c.maxStrokes) return;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ }
          const s = point(e);
          drawing.current = s;
          setStrokes((prev) => [...prev, s]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          // The stroke being drawn is always the last one; extend it in place.
          const s = [...drawing.current, ...point(e)];
          drawing.current = s;
          setStrokes((prev) => [...prev.slice(0, -1), s]);
        }}
        onPointerUp={() => { drawing.current = null; }}
        onPointerCancel={() => { drawing.current = null; }}
      />
      <div className="flex gap-[var(--space-s)]">
        <SmallButton disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>Undo</SmallButton>
        <SmallButton disabled={!strokes.length} onClick={() => setStrokes([])}>Clear</SmallButton>
      </div>
    </LibFrame>
  );
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function MapScreen(p: Props) {
  const c = parseScreenConfig("map", p.screen.configuration);
  const [route, setRoute] = useState<string[]>(c.start ? [c.start] : []);
  const [links, setLinks] = useState<[string, string][]>([]);
  const [from, setFrom] = useState<string | null>(null);
  const node = (id: string) => c.nodes.find((n) => n.id === id)!;
  const allowed = new Set(c.edges.map(([a, b]) => pairKey(a, b)));
  const last = route[route.length - 1];
  const nextOptions = c.mode === "route"
    ? c.nodes.filter((n) => (route.length === 0 ? true : n.id !== last && (!c.edges.length || allowed.has(pairKey(last, n.id)))))
    : [];
  const drawn = c.mode === "route" ? route.slice(1).map((id, i) => [route[i], id] as [string, string]) : links;
  const toggleLink = (a: string, b: string) => {
    const k = pairKey(a, b);
    setLinks(links.some(([x, y]) => pairKey(x, y) === k) ? links.filter(([x, y]) => pairKey(x, y) !== k) : links.length < c.maxLinks ? [...links, [a, b]] : links);
  };
  const ready = c.mode === "route" ? route.length >= 2 && (!c.end || last === c.end) : links.length > 0;

  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Done"} disabled={!ready} onAdvance={p.onAdvance} onSubmit={() => submit(p, c.mode === "route" ? route : links)}>
      <figure className="relative w-full max-w-[40rem]">
        {c.background && (
          // eslint-disable-next-line @next/next/no-img-element -- mission media
          <img src={c.background.src} alt={c.background.alt} className="block h-auto w-full rounded-[var(--radius-surface)]" />
        )}
        <svg viewBox="0 0 100 70" aria-hidden className={cn("w-full", c.background ? "absolute inset-0 h-full" : "rounded-[var(--radius-surface)] bg-[var(--color-surface-raised)]")} preserveAspectRatio="none">
          {c.edges.map(([a, b]) => (
            <line key={pairKey(a, b)} x1={node(a).x} y1={node(a).y * 0.7} x2={node(b).x} y2={node(b).y * 0.7} stroke="var(--color-border-strong)" strokeWidth="0.4" strokeDasharray="1 1" />
          ))}
          {drawn.map(([a, b], i) => (
            <line key={i} x1={node(a).x} y1={node(a).y * 0.7} x2={node(b).x} y2={node(b).y * 0.7} stroke="var(--color-primary)" strokeWidth="1.2" />
          ))}
          {c.nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y * 0.7} r="2.2" fill={route.includes(n.id) || from === n.id ? "var(--color-primary)" : "var(--color-surface)"} stroke="var(--color-text)" strokeWidth="0.4" />
              <text x={n.x} y={n.y * 0.7 - 3.2} fontSize="3" textAnchor="middle" fill="var(--color-text)">{n.label}</text>
            </g>
          ))}
        </svg>
      </figure>

      {c.mode === "route" ? (
        <div className="flex flex-col gap-[var(--space-m)]">
          <p aria-live="polite">
            <span className="font-medium">Your route: </span>
            {route.length ? route.map((id) => node(id).label).join(" → ") : "not started"}
            {c.end && last !== c.end ? <span className="text-[var(--color-text-muted)]"> · finish at {node(c.end).label}</span> : null}
          </p>
          <div>
            <p className="mb-[var(--space-xs)] text-[length:var(--text-small)]">{route.length ? "Go next to:" : "Start at:"}</p>
            <div className="flex flex-wrap gap-[var(--space-xs)]">
              {nextOptions.map((n) => (
                <SmallButton key={n.id} disabled={route.length > c.maxSteps} onClick={() => setRoute([...route, n.id])}>{n.label}</SmallButton>
              ))}
            </div>
          </div>
          <div className="flex gap-[var(--space-s)]">
            <SmallButton disabled={route.length <= (c.start ? 1 : 0)} onClick={() => setRoute(route.slice(0, -1))}>Back one step</SmallButton>
            <SmallButton disabled={route.length <= (c.start ? 1 : 0)} onClick={() => setRoute(c.start ? [c.start] : [])}>Clear</SmallButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--space-m)]">
          <p className="text-[length:var(--text-small)]">{from ? `Connect ${node(from).label} to:` : "Choose a place to connect from:"}</p>
          <div className="flex flex-wrap gap-[var(--space-xs)]">
            {c.nodes.map((n) => (
              <SmallButton key={n.id} aria-pressed={from === n.id} disabled={from === n.id}
                onClick={() => { if (!from) setFrom(n.id); else { toggleLink(from, n.id); setFrom(null); } }}>
                {n.label}
              </SmallButton>
            ))}
            {from && <SmallButton onClick={() => setFrom(null)}>Cancel</SmallButton>}
          </div>
          <ul aria-live="polite" aria-label="Your links" className="flex flex-col gap-[var(--space-xs)]">
            {links.map(([a, b]) => (
              <li key={pairKey(a, b)} className="flex items-center gap-[var(--space-s)]">
                <span>{node(a).label} — {node(b).label}</span>
                <SmallButton aria-label={`Remove link ${node(a).label} to ${node(b).label}`} onClick={() => toggleLink(a, b)}>Remove</SmallButton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </LibFrame>
  );
}

export function PatternGridScreen(p: Props) {
  const c = parseScreenConfig("pattern_grid", p.screen.configuration);
  const size = c.rows * c.cols;
  const [grid, setGrid] = useState<string[]>(() => Array.from({ length: size }, (_, i) => c.given[i] || ""));
  const [brush, setBrush] = useState<string>(c.palette[0].id);
  const piece = (id: string) => c.palette.find((x) => x.id === id);
  const options = [...c.palette.map((x) => ({ id: x.id, label: `${x.symbol ? `${x.symbol} ` : ""}${x.label}` })), { id: "", label: "Empty" }];
  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? "Check"} onSubmit={() => submit(p, grid)} onAdvance={p.onAdvance}>
      <Segmented label="Piece to place" options={options} value={brush} onChange={setBrush} />
      <div className={cn(c.cols > 7 && "overflow-x-auto")} role="group" aria-label={`Pattern grid, ${c.rows} rows by ${c.cols} columns`}>
        <div className="grid w-max gap-[4px]" style={{ gridTemplateColumns: `repeat(${c.cols}, 48px)` }}>
          {grid.map((cell, i) => {
            const fixed = Boolean(c.given[i]);
            const pc = piece(cell);
            return (
              <button key={i} type="button" disabled={fixed}
                aria-label={`Row ${Math.floor(i / c.cols) + 1}, column ${(i % c.cols) + 1}: ${pc?.label ?? "empty"}${fixed ? ", fixed" : ""}`}
                onClick={() => setGrid(grid.map((x, j) => (j === i ? (x === brush ? "" : brush) : x)))}
                className={cn("flex h-[48px] w-[48px] items-center justify-center rounded-[var(--radius-control)] border text-[length:var(--text-h3)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]",
                  fixed ? "border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]" : "border-[var(--color-border)] bg-[var(--color-surface)]")}>
                <span aria-hidden>{pc ? pc.symbol ?? pc.label.slice(0, 2) : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </LibFrame>
  );
}

// --------------------------------------------------------- workspace ----

type Board = {
  label: string;
  kind: string;
  zones: { id: string; label: string; description?: string }[];
  objects: { id: string; label: string; description?: string }[];
  links: boolean;
  maxLinks: number;
  saved: { placements: Record<string, string>; links: [string, string][] };
};

export function WorkspaceScreen(p: Props) {
  const c = parseScreenConfig("workspace", p.screen.configuration);
  const board = extra<Board>(p.screen, "board");
  const [placements, setPlacements] = useState<Record<string, string>>(() => {
    const saved = board?.saved.placements ?? {};
    return Object.fromEntries(Object.entries(saved).filter(([o]) => board?.objects.some((x) => x.id === o)));
  });
  const [links, setLinks] = useState<[string, string][]>(() => board?.saved.links ?? []);
  const [linkA, setLinkA] = useState("");
  const [linkB, setLinkB] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  if (!board) return null;
  const review = c.mode === "review";
  const obj = (id: string) => board.objects.find((o) => o.id === id);
  const missing = c.requirePlaced.filter((o) => !placements[o]);
  const unplaced = board.objects.filter((o) => !placements[o.id]);

  return (
    <LibFrame screen={p.screen} prompt={c.prompt} instruction={c.instruction} missionControl={c.missionControl} error={p.error} isPending={p.isPending}
      label={c.actionLabel ?? (review ? "Continue" : "Save the board")} disabled={!review && missing.length > 0} onAdvance={p.onAdvance}
      onSubmit={() => submit(p, review ? null : { placements, links })}>
      <h3 className="text-[length:var(--text-h3)]">{board.label}</h3>
      <div className="grid gap-[var(--space-m)] sm:grid-cols-2">
        {board.zones.map((z) => (
          <section key={z.id} aria-labelledby={`zone-${z.id}`}
            onDragOver={(e) => { if (!review) e.preventDefault(); }}
            onDrop={() => { if (dragging) setPlacements({ ...placements, [dragging]: z.id }); setDragging(null); }}
            className="min-h-[96px] rounded-[var(--radius-surface)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-[var(--space-m)]">
            <h4 id={`zone-${z.id}`} className="font-medium">{z.label}</h4>
            {z.description && <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{z.description}</p>}
            <ul className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
              {board.objects.filter((o) => placements[o.id] === z.id).map((o) => (
                <li key={o.id} draggable={!review} onDragStart={() => setDragging(o.id)}
                  className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] py-[var(--space-xs)] shadow-[var(--shadow-raised)]">
                  {o.label}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {!review && (
        <div className="flex flex-col gap-[var(--space-m)]">
          <h4 className="font-medium">Pieces{unplaced.length ? ` — ${unplaced.length} not placed yet` : ""}</h4>
          <ul className="flex flex-col gap-[var(--space-m)]">
            {board.objects.map((o) => (
              <li key={o.id} draggable onDragStart={() => setDragging(o.id)} className="flex flex-col gap-[var(--space-xs)]">
                <span className="font-medium">{o.label}{c.requirePlaced.includes(o.id) && !placements[o.id] ? " (needed for this step)" : ""}</span>
                {o.description && <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{o.description}</span>}
                <Segmented label={`Where ${o.label} goes`} options={[...board.zones, { id: "", label: "Not placed" }]} value={placements[o.id] ?? ""}
                  onChange={(zid) => { const n = { ...placements }; if (zid) n[o.id] = zid; else delete n[o.id]; setPlacements(n); }} />
              </li>
            ))}
          </ul>

          {board.links && (
            <section aria-labelledby={`links-${p.screen.screenKey}`} className="flex flex-col gap-[var(--space-s)]">
              <h4 id={`links-${p.screen.screenKey}`} className="font-medium">Connections</h4>
              <div className="flex flex-wrap items-end gap-[var(--space-s)]">
                {[["From", linkA, setLinkA], ["To", linkB, setLinkB]].map(([label, val, set]) => (
                  <label key={label as string} className="flex flex-col gap-[var(--space-xs)]">
                    <span className="text-[length:var(--text-small)]">{label as string}</span>
                    <select value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}
                      className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)]">
                      <option value="">Choose…</option>
                      {board.objects.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </label>
                ))}
                <SmallButton disabled={!linkA || !linkB || linkA === linkB || links.length >= board.maxLinks || links.some(([a, b]) => pairKey(a, b) === pairKey(linkA, linkB))}
                  onClick={() => { setLinks([...links, [linkA, linkB]]); setLinkA(""); setLinkB(""); }}>Connect</SmallButton>
              </div>
              <ul aria-live="polite" className="flex flex-col gap-[var(--space-xs)]">
                {links.map(([a, b]) => (
                  <li key={pairKey(a, b)} className="flex items-center gap-[var(--space-s)]">
                    <span>{obj(a)?.label} — {obj(b)?.label}</span>
                    <SmallButton aria-label={`Remove connection ${obj(a)?.label} to ${obj(b)?.label}`} onClick={() => setLinks(links.filter(([x, y]) => pairKey(x, y) !== pairKey(a, b)))}>Remove</SmallButton>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {review && board.links && links.length > 0 && (
        <ul aria-label="Connections" className="flex flex-col gap-[var(--space-xs)]">
          {links.map(([a, b]) => <li key={pairKey(a, b)}>{obj(a)?.label} — {obj(b)?.label}</li>)}
        </ul>
      )}
    </LibFrame>
  );
}

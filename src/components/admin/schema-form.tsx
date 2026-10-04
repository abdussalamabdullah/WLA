"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import type { z } from "zod";
import { condition as conditionSchema } from "@/features/mission-engine/conditions";
import { cn } from "@/lib/utils";

/**
 * SCHEMA-DRIVEN AUTHORING FORMS (Enhancement Plan §12).
 *
 * Renders an accessible form for ANY zod schema in the mission model — every
 * interaction type's configuration, the common screen logic, and every section
 * of the mission definition. A new interaction type gets a real form the day
 * its schema exists; nothing here knows any mission or any type by name.
 *
 * WLA terminology comes from the schemas' `.describe()` text and `LABELS`;
 * conditions get the visual condition builder rather than raw structure.
 */

type AnyZod = z.ZodType & { def: Record<string, unknown>; description?: string };

/** What the author can pick from: screens, variables, unlocks, events, assets. */
export type AuthoringVocabulary = {
  screens: string[];
  variables: string[];
  unlocks: string[];
  events: string[];
  assets: string[];
};
const Vocab = createContext<AuthoringVocabulary>({ screens: [], variables: [], unlocks: [], events: [], assets: [] });
export const VocabularyProvider = Vocab.Provider;

const LABELS: Record<string, string> = {
  next: "Goes to", to: "Goes to", otherwise: "Otherwise goes to", when: "Only when", requires: "Shown only when",
  effects: "Changes to mission state", routes: "Routes (first match wins)", trail: "Mission Trail marker",
  retry: "Retry", timer: "Timed stage", media: "Media", support: "Mission Control support",
  convergeAt: "Branches meet again at", required: "Required on every route", missionControl: "Mission Control (basic)",
  revealedBody: "Revealed content", concealedPrompt: "Before it opens", returnInstruction: "When to come back",
  canonicalTracker: "Tracker values set here", fromInput: "Save the child's own answer",
  relatesTo: "Relates to earlier evidence", storeAs: "Store the result in", availableAfter: "Opens after",
  ageBand: "Age band", maxItems: "Most items", selectExactly: "Choose exactly", inputType: "Answer type",
};
const LONG = new Set(["body", "revealedBody", "prompt", "message", "instruction", "description", "returnInstruction", "concealedPrompt", "trailSummary", "confirmNote", "location"]);
const SCREEN_REFS = new Set(["next", "to", "otherwise", "convergeAt", "screenKey", "goto", "unusedFrom", "fromResponse"]);

const humanise = (k: string) => LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function unwrap(s: AnyZod): { schema: AnyZod; optional: boolean; defaultValue?: unknown } {
  let cur = s;
  let optional = false;
  let defaultValue: unknown;
  for (let i = 0; i < 8; i++) {
    const t = cur.def.type;
    if (t === "optional" || t === "nullable") { optional = true; cur = cur.def.innerType as AnyZod; continue; }
    if (t === "default") { defaultValue = typeof cur.def.defaultValue === "function" ? (cur.def.defaultValue as () => unknown)() : cur.def.defaultValue; cur = cur.def.innerType as AnyZod; continue; }
    if (t === "lazy" && cur !== (conditionSchema as unknown)) { cur = (cur.def.getter as () => AnyZod)(); continue; }
    if (t === "pipe") { cur = cur.def.in as AnyZod; continue; }
    break;
  }
  return { schema: cur, optional, defaultValue };
}

const isCondition = (s: AnyZod) => (s as unknown) === conditionSchema || (s.def.type === "lazy" && (s as unknown) === conditionSchema);

/** An empty value of the right shape, for "Add". */
export function emptyFor(s: AnyZod): unknown {
  const { schema, defaultValue } = unwrap(s);
  if (defaultValue !== undefined) return structuredClone(defaultValue);
  if (isCondition(schema)) return { always: true };
  switch (schema.def.type) {
    case "string": return "";
    case "number": return 0;
    case "boolean": return false;
    case "enum": return Object.values(schema.def.entries as Record<string, string>)[0];
    case "literal": return (schema.def.values as unknown[])[0];
    case "array": return [];
    case "record": return {};
    case "object": {
      const shape = (schema as unknown as { shape: Record<string, AnyZod> }).shape;
      return Object.fromEntries(Object.entries(shape).filter(([, f]) => !unwrap(f).optional).map(([k, f]) => [k, emptyFor(f)]));
    }
    case "union": return emptyFor((schema.def.options as AnyZod[])[0]);
    default: return null;
  }
}

const inputCls = "min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";
const smallBtn = "inline-flex min-h-[var(--target-min)] items-center px-[var(--space-xs)] text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4";

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <label htmlFor={htmlFor} className="text-[length:var(--text-small)] font-medium">{label}</label>
      {hint && <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{hint}</p>}
      {children}
    </div>
  );
}

export function SchemaForm({
  schema,
  value,
  onChange,
  label,
  fieldKey = "",
  hide = [],
}: {
  schema: z.ZodType;
  value: unknown;
  onChange: (v: unknown) => void;
  label?: string;
  fieldKey?: string;
  hide?: string[];
}) {
  const id = useId();
  const vocab = useContext(Vocab);
  const s = schema as AnyZod;
  const { schema: inner } = unwrap(s);
  const t = inner.def.type;
  const name = label ?? humanise(fieldKey);
  const hint = s.description ?? inner.description;

  if (isCondition(inner)) {
    return (
      <Row label={name} hint={hint}>
        <ConditionBuilder value={value} onChange={onChange} />
      </Row>
    );
  }

  if (t === "object") {
    const shape = (inner as unknown as { shape: Record<string, AnyZod> }).shape;
    const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return (
      <fieldset className="flex flex-col gap-[var(--space-m)] rounded-[var(--radius-surface)] border border-[var(--color-border)] p-[var(--space-m)]">
        {label !== "" && <legend className="px-[4px] text-[length:var(--text-small)] font-medium">{name}</legend>}
        {Object.entries(shape).filter(([k]) => !hide.includes(k)).map(([k, field]) => {
          const u = unwrap(field);
          const present = obj[k] !== undefined;
          const scalar = ["string", "number", "boolean", "enum"].includes(u.schema.def.type);
          if (u.optional && !present && !scalar) {
            return (
              <button key={k} type="button" className={cn(smallBtn, "self-start")} onClick={() => onChange({ ...obj, [k]: emptyFor(field) })}>
                Add {humanise(k).toLowerCase()}
              </button>
            );
          }
          return (
            <div key={k} className="flex flex-col gap-[4px]">
              <SchemaForm schema={field} value={obj[k]} fieldKey={k} onChange={(v) => {
                const next = { ...obj };
                if (v === undefined || (u.optional && v === "")) delete next[k]; else next[k] = v;
                onChange(next);
              }} />
              {u.optional && present && !scalar && (
                <button type="button" className={cn(smallBtn, "self-start text-[var(--color-text-muted)]")} onClick={() => { const next = { ...obj }; delete next[k]; onChange(next); }}>
                  Remove {humanise(k).toLowerCase()}
                </button>
              )}
            </div>
          );
        })}
      </fieldset>
    );
  }

  if (t === "array") {
    const el = inner.def.element as AnyZod;
    const list = Array.isArray(value) ? value : [];
    const set = (next: unknown[]) => onChange(next);
    return (
      <div className="flex flex-col gap-[var(--space-s)]">
        <p className="text-[length:var(--text-small)] font-medium">{name}</p>
        {hint && <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{hint}</p>}
        <ol className="flex flex-col gap-[var(--space-s)]">
          {list.map((item, i) => (
            <li key={i} className="flex flex-col gap-[4px]">
              <SchemaForm schema={el} value={item} label={`${humanise(fieldKey).replace(/s$/, "")} ${i + 1}`} onChange={(v) => set(list.map((x, j) => (j === i ? v : x)))} />
              <div className="flex flex-wrap gap-[var(--space-xs)]">
                <button type="button" className={smallBtn} disabled={i === 0} onClick={() => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); }}>Move up<span className="sr-only"> item {i + 1}</span></button>
                <button type="button" className={smallBtn} disabled={i === list.length - 1} onClick={() => { const n = [...list]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); }}>Move down<span className="sr-only"> item {i + 1}</span></button>
                <button type="button" className={smallBtn} onClick={() => set([...list.slice(0, i + 1), structuredClone(item), ...list.slice(i + 1)])}>Duplicate<span className="sr-only"> item {i + 1}</span></button>
                <button type="button" className={cn(smallBtn, "text-[var(--color-error)]")} onClick={() => set(list.filter((_, j) => j !== i))}>Remove<span className="sr-only"> item {i + 1}</span></button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className={cn(smallBtn, "self-start")} onClick={() => set([...list, emptyFor(el)])}>
          Add {humanise(fieldKey).replace(/s$/, "").toLowerCase() || "item"}
        </button>
      </div>
    );
  }

  if (t === "union") {
    const options = inner.def.options as AnyZod[];
    const objectish = options.every((o) => unwrap(o).schema.def.type === "object");
    if (!objectish) return <JsonField id={id} label={name} hint={hint} value={value} onChange={onChange} />;
    // Pick the variant by its literal discriminator (op / type / kind), else by shape.
    const discr = (o: AnyZod) => {
      const shape = (unwrap(o).schema as unknown as { shape: Record<string, AnyZod> }).shape;
      const d = Object.entries(shape).find(([, f]) => unwrap(f).schema.def.type === "literal");
      return d ? { key: d[0], value: (unwrap(d[1]).schema.def.values as unknown[])[0] } : null;
    };
    const cur = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    let index = options.findIndex((o) => { const d = discr(o); return d ? cur[d.key] === d.value : false; });
    if (index < 0) index = 0;
    return (
      <div className="flex flex-col gap-[var(--space-s)]">
        <Row label={`${name} — kind`} htmlFor={id}>
          <select id={id} className={inputCls} value={index} onChange={(e) => onChange(emptyFor(options[Number(e.target.value)]))}>
            {options.map((o, i) => <option key={i} value={i}>{String(discr(o)?.value ?? `Option ${i + 1}`).replace(/_/g, " ")}</option>)}
          </select>
        </Row>
        <SchemaForm schema={options[index]} value={value} label="" onChange={onChange} />
      </div>
    );
  }

  if (t === "string") {
    const listId = `${id}-list`;
    const suggestions = SCREEN_REFS.has(fieldKey) ? vocab.screens : fieldKey === "var" || fieldKey === "storeAs" ? vocab.variables : fieldKey === "asset" ? vocab.assets : [];
    return (
      <Row label={name} hint={hint} htmlFor={id}>
        {LONG.has(fieldKey) ? (
          <textarea id={id} rows={3} className={cn(inputCls, "p-[var(--space-s)]")} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <>
            <input id={id} className={inputCls} value={String(value ?? "")} list={suggestions.length ? listId : undefined} onChange={(e) => onChange(e.target.value)} />
            {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((x) => <option key={x} value={x} />)}</datalist>}
          </>
        )}
      </Row>
    );
  }
  if (t === "number") {
    return (
      <Row label={name} hint={hint} htmlFor={id}>
        <input id={id} type="number" className={inputCls} value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
      </Row>
    );
  }
  if (t === "boolean") {
    return (
      <label className="inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-s)] self-start text-[length:var(--text-label)]">
        <input type="checkbox" className="size-5" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {name}
      </label>
    );
  }
  if (t === "enum") {
    const opts = Object.values(inner.def.entries as Record<string, string>);
    return (
      <Row label={name} hint={hint} htmlFor={id}>
        <select id={id} className={inputCls} value={String(value ?? opts[0])} onChange={(e) => onChange(e.target.value)}>
          {opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
        </select>
      </Row>
    );
  }
  if (t === "literal") return null;
  return <JsonField id={id} label={name} hint={hint} value={value} onChange={onChange} />;
}

function JsonField({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => (value === undefined ? "" : JSON.stringify(value, null, 2)));
  const [bad, setBad] = useState(false);
  return (
    <Row label={label} hint={hint ?? "A value, a list or an object."} htmlFor={id}>
      <textarea
        id={id}
        rows={3}
        spellCheck={false}
        aria-invalid={bad}
        className={cn(inputCls, "p-[var(--space-s)] font-mono text-[length:var(--text-small)]")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try { onChange(e.target.value.trim() === "" ? undefined : JSON.parse(e.target.value)); setBad(false); }
          catch { setBad(true); }
        }}
      />
      {bad && <p className="text-[length:var(--text-small)] text-[var(--color-error)]">Not valid yet.</p>}
    </Row>
  );
}

// ------------------------------------------------------- condition builder --

const REF_KINDS = [
  ["var", "Variable"], ["choice", "Choice made on"], ["multi", "Options picked on"], ["response", "Answer given on"],
  ["visited", "Screen reached"], ["revealed", "Revealed"], ["unlocked", "Unlocked"], ["handoff", "Handoff confirmed"],
  ["event", "Event happened"], ["attempts", "Attempts on"], ["variant", "Variant"], ["elapsed", "Seconds since"],
] as const;
const OPS = [["eq", "is"], ["neq", "is not"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["exists", "exists"], ["not_exists", "does not exist"], ["contains", "contains"], ["in", "is one of"]] as const;

function parseValue(raw: string, op: string): unknown {
  if (op === "in") return raw.split(",").map((x) => parseValue(x.trim(), "eq"));
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}
const showValue = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === undefined ? "" : String(v));

/** A visual editor for the shared condition language (F2). */
export function ConditionBuilder({ value, onChange, depth = 0 }: { value: unknown; onChange: (v: unknown) => void; depth?: number }) {
  const id = useId();
  const vocab = useContext(Vocab);
  const node = (value && typeof value === "object" ? value : { always: true }) as Record<string, unknown>;
  const kind = Array.isArray(node.all) ? "all" : Array.isArray(node.any) ? "any" : "not" in node ? "not" : "ref" in node ? "compare" : "always";
  const setKind = (k: string) =>
    onChange(k === "all" ? { all: [] } : k === "any" ? { any: [] } : k === "not" ? { not: { always: true } } : k === "compare" ? { ref: { var: "" }, op: "eq", value: "" } : { always: true });

  return (
    <div className={cn("flex flex-col gap-[var(--space-s)]", depth > 0 && "border-l-2 border-[var(--color-border)] pl-[var(--space-s)]")}>
      <label className="sr-only" htmlFor={`${id}-k`}>Condition type</label>
      <select id={`${id}-k`} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="always">Always</option>
        <option value="compare">When…</option>
        <option value="all">All of these</option>
        <option value="any">Any of these</option>
        <option value="not">Not</option>
      </select>
      {(kind === "all" || kind === "any") && (() => {
        const list = node[kind] as unknown[];
        return (
          <div className="flex flex-col gap-[var(--space-s)]">
            {list.map((c, i) => (
              <div key={i} className="flex flex-col gap-[4px]">
                <ConditionBuilder depth={depth + 1} value={c} onChange={(v) => onChange({ [kind]: list.map((x, j) => (j === i ? v : x)) })} />
                <button type="button" className={cn(smallBtn, "self-start text-[var(--color-error)]")} onClick={() => onChange({ [kind]: list.filter((_, j) => j !== i) })}>Remove condition {i + 1}</button>
              </div>
            ))}
            <button type="button" className={cn(smallBtn, "self-start")} onClick={() => onChange({ [kind]: [...list, { ref: { var: "" }, op: "eq", value: "" }] })}>Add condition</button>
          </div>
        );
      })()}
      {kind === "not" && <ConditionBuilder depth={depth + 1} value={node.not} onChange={(v) => onChange({ not: v })} />}
      {kind === "compare" && (() => {
        const ref = (node.ref ?? {}) as Record<string, unknown>;
        const refKind = Object.keys(ref)[0] ?? "var";
        const target = refKind === "elapsed" ? String((ref.elapsed as { since?: string })?.since ?? "") : refKind === "variant" ? "" : String(ref[refKind] ?? "");
        const sugg = refKind === "var" ? vocab.variables : refKind === "unlocked" ? vocab.unlocks : refKind === "event" ? vocab.events : refKind === "elapsed" ? ["start", ...vocab.screens.map((k) => `screen:${k}`)] : vocab.screens;
        const op = String(node.op ?? "eq");
        const setRef = (k: string, t: string) => onChange({ ...node, ref: k === "variant" ? { variant: true } : k === "elapsed" ? { elapsed: { since: t } } : { [k]: t } });
        return (
          <div className="grid gap-[var(--space-s)] sm:grid-cols-4">
            <div><label className="sr-only" htmlFor={`${id}-r`}>What</label>
              <select id={`${id}-r`} className={inputCls} value={refKind} onChange={(e) => setRef(e.target.value, "")}>
                {REF_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            {refKind !== "variant" && <div><label className="sr-only" htmlFor={`${id}-t`}>Which</label>
              <input id={`${id}-t`} className={inputCls} list={`${id}-tl`} value={target} placeholder="which" onChange={(e) => setRef(refKind, e.target.value)} />
              <datalist id={`${id}-tl`}>{sugg.map((x) => <option key={x} value={x} />)}</datalist></div>}
            <div><label className="sr-only" htmlFor={`${id}-o`}>Test</label>
              <select id={`${id}-o`} className={inputCls} value={op} onChange={(e) => onChange({ ...node, op: e.target.value })}>
                {OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            {op !== "exists" && op !== "not_exists" && <div><label className="sr-only" htmlFor={`${id}-v`}>Value</label>
              <input id={`${id}-v`} className={inputCls} value={showValue(node.value)} placeholder={op === "in" ? "a, b, c" : "value"} onChange={(e) => onChange({ ...node, value: parseValue(e.target.value, op) })} /></div>}
          </div>
        );
      })()}
    </div>
  );
}

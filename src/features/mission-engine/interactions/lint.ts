import type { LintIssue } from "../contract";
import type { MissionModel } from "../definition";
import type { MissionScreen } from "../navigation";
import { libraryConfigByType, type LibraryType } from "./schemas";

/**
 * Authoring checks for the interaction library, run by the mission validator
 * before review and before publish. They catch what a schema cannot: an
 * answer that names an item the screen does not have, an outcome no input
 * could ever reach, a variable that was never declared, a board that does not
 * exist, an image without a text alternative.
 */

const L = (severity: LintIssue["severity"], category: LintIssue["category"], code: string, screenKey: string, detail: string): LintIssue =>
  ({ code, severity, category, screenKey, detail });

export function lintLibraryScreen(screen: MissionScreen, model: MissionModel): LintIssue[] {
  const type = screen.type as LibraryType;
  const schema = libraryConfigByType[type];
  if (!schema) return [];
  const parsed = schema.safeParse(screen.configuration ?? {});
  if (!parsed.success) return []; // reported as invalid configuration elsewhere
  const c = parsed.data as Record<string, unknown> & {
    outcomes?: { id: string; match: Record<string, unknown> }[];
    onNoMatch?: { mode: string; fallbackAfter?: number; fallbackNext?: string; next?: string };
    storeAs?: string;
  };
  const k = screen.screenKey;
  const out: LintIssue[] = [];
  const decl = new Map(model.definition.variables.map((d) => [d.key, d]));
  const screens = new Set(model.screens.map((s) => s.screenKey));

  const needVar = (key: string | undefined, where: string, list = false) => {
    if (!key) return;
    const d = decl.get(key);
    if (!d) out.push(L("blocking", "logic", "undeclared_variable", k, `${where} stores into "${key}", which is not declared.`));
    else if (list && d.type !== "list") out.push(L("blocking", "logic", "type_mismatch", k, `${where} stores a list into "${key}", which is a ${d.type}.`));
  };
  needVar(c.storeAs, "This screen", type === "inventory");

  // outcomes
  const outcomes = c.outcomes ?? [];
  const ids = outcomes.map((o) => o.id);
  for (const d of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) out.push(L("blocking", "logic", "duplicate_outcome", k, `Outcome "${d}" is defined twice.`));
  if (ids.includes("no_match")) out.push(L("blocking", "logic", "reserved_outcome", k, `"no_match" is reserved for input that matches nothing.`));
  for (const o of outcomes as { id: string; next?: string }[]) {
    if (o.next && !screens.has(o.next)) out.push(L("blocking", "structure", "broken_reference", k, `Outcome "${o.id}" leads to "${o.next}", which is not a screen.`));
  }
  const nm = c.onNoMatch;
  if (nm) {
    for (const t of [nm.next, nm.fallbackNext]) if (t && !screens.has(t)) out.push(L("blocking", "structure", "broken_reference", k, `No-match leads to "${t}", which is not a screen.`));
    if (outcomes.length && nm.mode === "retry" && !nm.fallbackNext) {
      out.push(L("advisory", "accessibility", "no_recovery_route", k, "A child who cannot find the answer has no way on. Add a fallback after some attempts, or Mission Control recovery help."));
    }
  }

  const known = (list: unknown) => new Set(((list as { id: string }[]) ?? []).map((x) => x.id));
  const unknownIn = (vals: string[], set: Set<string>, what: string, oid: string) => {
    for (const v of vals) if (v !== "" && !set.has(v)) out.push(L("blocking", "logic", "unknown_answer_item", k, `Outcome "${oid}" names ${what} "${v}", which this screen does not have.`));
  };

  switch (type) {
    case "numeric_entry": {
      const n = c as unknown as { min?: number; max?: number };
      for (const o of outcomes) {
        const m = o.match as { equals?: number; min?: number; max?: number };
        if (m.equals === undefined && m.min === undefined && m.max === undefined) out.push(L("blocking", "logic", "empty_match", k, `Outcome "${o.id}" matches every number.`));
        const v = m.equals ?? m.min;
        if (v !== undefined && ((n.max !== undefined && v > n.max) || (n.min !== undefined && v < n.min))) out.push(L("blocking", "logic", "unreachable_outcome", k, `Outcome "${o.id}" is outside the allowed range.`));
      }
      break;
    }
    case "code_entry": {
      const max = (c as unknown as { maxLength: number }).maxLength;
      for (const o of outcomes) for (const v of (o.match as { values: string[] }).values) if (v.length > max) out.push(L("blocking", "logic", "unreachable_outcome", k, `"${o.id}" needs more than ${max} characters.`));
      break;
    }
    case "token_sequence": {
      const t = known(c.tokens);
      const len = c.length as number;
      for (const o of outcomes) for (const seq of (o.match as { sequences: string[][] }).sequences) {
        unknownIn(seq, t, "symbol", o.id);
        if (seq.length !== len) out.push(L("blocking", "logic", "unreachable_outcome", k, `Outcome "${o.id}" has ${seq.length} symbols; the screen takes ${len}.`));
      }
      break;
    }
    case "arrange": {
      const items = known(c.items);
      const groups = known(c.groups);
      if (c.mode === "sort" && groups.size < 2) out.push(L("blocking", "content", "missing_groups", k, "Sorting needs at least two groups."));
      for (const o of outcomes) {
        const m = o.match as { order?: string[]; groups?: Record<string, string> };
        if (m.order) unknownIn(m.order, items, "item", o.id);
        if (m.groups) { unknownIn(Object.keys(m.groups), items, "item", o.id); unknownIn(Object.values(m.groups), groups, "group", o.id); }
        if (c.mode === "sort" ? !m.groups : !m.order) out.push(L("blocking", "logic", "unreachable_outcome", k, `Outcome "${o.id}" doesn't describe a ${c.mode === "sort" ? "grouping" : "order"}.`));
      }
      break;
    }
    case "matching": {
      const l = known(c.left), r = known(c.right);
      for (const o of outcomes) { const p = (o.match as { pairs: Record<string, string> }).pairs; unknownIn(Object.keys(p), l, "item", o.id); unknownIn(Object.values(p), r, "match", o.id); }
      if (c.oneToOne && c.requireAll && r.size < l.size) out.push(L("blocking", "logic", "impossible_input", k, "There are fewer matches than items, and each can be used once."));
      break;
    }
    case "allocate": {
      const ctl = c.controls as { id: string; min: number; max: number; storeAs?: string; ends?: unknown }[];
      for (const x of ctl) { needVar(x.storeAs, `Control "${x.id}"`); if (x.min >= x.max) out.push(L("blocking", "content", "empty_range", k, `Control "${x.id}" has no range.`)); }
      if (c.mode !== "sliders" && c.total === undefined) out.push(L("blocking", "content", "missing_total", k, "Weighting and allocation need a total."));
      if (c.exact && typeof c.total === "number" && ctl.reduce((a, x) => a + x.max, 0) < c.total) out.push(L("blocking", "logic", "impossible_input", k, "The controls cannot add up to the total."));
      const ids2 = known(ctl);
      for (const o of outcomes) unknownIn(Object.keys((o.match as { ranges: object }).ranges), ids2, "control", o.id);
      break;
    }
    case "inventory": {
      const items = c.items as unknown[];
      if ((c.min as number) > (c.max as number)) out.push(L("blocking", "logic", "impossible_input", k, "The minimum is more than the maximum."));
      if ((c.min as number) > items.length) out.push(L("blocking", "logic", "impossible_input", k, "There are fewer items than the minimum."));
      if (!c.storeAs) out.push(L("advisory", "logic", "inventory_not_kept", k, "Nothing keeps this selection: set storeAs to a list variable so later screens can use it."));
      break;
    }
    case "compare": {
      if (c.mode === "matrix" && (c.scale as string[]).length < 2) out.push(L("blocking", "content", "missing_scale", k, "A decision matrix needs at least two scale labels."));
      if (c.mode === "comparison") {
        const missing = (c.options as { id: string }[]).flatMap((o) => (c.criteria as { id: string }[]).map((cr) => `${o.id}.${cr.id}`)).filter((key) => !(key in (c.cells as object)));
        if (missing.length) out.push(L("advisory", "content", "empty_cells", k, `${missing.length} comparison cell${missing.length === 1 ? " is" : "s are"} empty.`));
      }
      for (const o of c.options as { id: string; next?: string }[]) if (o.next && !screens.has(o.next)) out.push(L("blocking", "structure", "broken_reference", k, `Option "${o.id}" leads to "${o.next}", which is not a screen.`));
      break;
    }
    case "hotspot": {
      const r = known(c.regions);
      if ((c.minSelect as number) > (c.maxSelect as number)) out.push(L("blocking", "logic", "impossible_input", k, "The minimum is more than the maximum."));
      for (const o of outcomes) {
        const regs = (o.match as { regions: string[] }).regions;
        unknownIn(regs, r, "region", o.id);
        if (c.mode === "find" && regs.length > (c.maxSelect as number)) out.push(L("blocking", "logic", "unreachable_outcome", k, `Outcome "${o.id}" needs more regions than can be chosen.`));
      }
      break;
    }
    case "map": {
      const nodes = known(c.nodes);
      for (const [a, b] of c.edges as [string, string][]) unknownIn([a, b], nodes, "place", "edges");
      for (const p of [c.start, c.end] as (string | undefined)[]) if (p && !nodes.has(p)) out.push(L("blocking", "logic", "unknown_answer_item", k, `"${p}" is not a place on the map.`));
      if (!c.background) out.push(L("advisory", "accessibility", "map_without_background", k, "Places are shown as a list and a plain diagram; add a background image with a description if the map needs one."));
      for (const o of outcomes) {
        const m = o.match as { path?: string[]; visits?: string[]; links?: [string, string][] };
        unknownIn([...(m.path ?? []), ...(m.visits ?? []), ...(m.links ?? []).flat()], nodes, "place", o.id);
      }
      break;
    }
    case "pattern_grid": {
      const size = (c.rows as number) * (c.cols as number);
      const pal = known(c.palette);
      if ((c.given as string[]).length > size) out.push(L("blocking", "content", "grid_mismatch", k, "There are more fixed squares than the grid holds."));
      for (const o of outcomes) {
        const g = (o.match as { grid: string[] }).grid;
        if (g.length !== size) out.push(L("blocking", "logic", "unreachable_outcome", k, `Outcome "${o.id}" has ${g.length} squares; the grid has ${size}.`));
        unknownIn(g, pal, "piece", o.id);
        (c.given as string[]).forEach((x, i) => { if (x && g[i] !== x) out.push(L("blocking", "logic", "unreachable_outcome", k, `Outcome "${o.id}" changes a fixed square.`)); });
      }
      break;
    }
    case "simulation": {
      for (const x of c.controls as { id: string; storeAs?: string }[]) {
        if (!x.storeAs) out.push(L("blocking", "logic", "unbound_control", k, `Control "${x.id}" isn't stored, so no readout can respond to it.`));
        needVar(x.storeAs, `Control "${x.id}"`);
      }
      if (!(c.readouts as { when: unknown }[]).some((r) => JSON.stringify(r.when) === '{"always":true}')) {
        out.push(L("advisory", "content", "no_default_readout", k, "Add a readout for when nothing else applies, so every run shows something."));
      }
      break;
    }
    case "workspace": {
      const ws = model.definition.workspaces.find((w) => w.key === c.workspace);
      if (!ws) { out.push(L("blocking", "structure", "unknown_workspace", k, `Uses board "${String(c.workspace)}", which the mission does not define.`)); break; }
      const objs = new Set(ws.objects.map((o) => o.id));
      unknownIn(c.requirePlaced as string[], objs, "object", "requirePlaced");
      break;
    }
    case "sketch":
      if ((c as { store?: boolean }).store) out.push(L("advisory", "content", "stores_drawing", k, "Drawings will be kept as part of the child's record. Only keep them where the mission needs them (Brief §46)."));
      break;
  }

  const img = c.image as { alt?: string } | undefined;
  if (img && !img.alt?.trim()) out.push(L("blocking", "accessibility", "missing_alt_text", k, "The image needs a text alternative."));
  return out;
}

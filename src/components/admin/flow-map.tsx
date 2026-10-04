"use client";

/**
 * MISSION FLOW MAP (Enhancement Plan §12: visual mission-flow mapping, branch
 * and convergence mapping).
 *
 * Drawn from the canonical model — the same screens and definition the runtime
 * plays — so the map cannot disagree with the mission. Layers come from the
 * shortest path from the first screen; every way between screens is an edge:
 * a decision option, an ordered route, `next`, `otherwise`, an event's
 * interruption. A screen two different branches arrive at is a convergence
 * point. A text list carries the same information for screen readers and for
 * anyone who prefers reading to diagrams.
 */

type ScreenLite = { screen_key: string; type: string; title: string | null; sequence: number; configuration: unknown };
type Edge = { from: string; to: string; label: string; kind: "option" | "route" | "next" | "otherwise" | "event" };

const W = 176, H = 58, GX = 72, GY = 22;

export function buildEdges(screens: ScreenLite[], events: { key: string; goto?: string }[] = []): Edge[] {
  const edges: Edge[] = [];
  for (const s of screens) {
    const c = (s.configuration ?? {}) as Record<string, unknown>;
    for (const o of (Array.isArray(c.options) ? c.options : []) as { id: string; label?: string; next?: string }[]) {
      if (o.next) edges.push({ from: s.screen_key, to: o.next, label: o.label ?? o.id, kind: "option" });
    }
    for (const [i, r] of ((Array.isArray(c.routes) ? c.routes : []) as { to: string }[]).entries()) {
      edges.push({ from: s.screen_key, to: r.to, label: `route ${i + 1}`, kind: "route" });
    }
    if (typeof c.next === "string" && c.next) edges.push({ from: s.screen_key, to: c.next, label: "", kind: "next" });
    if (typeof c.otherwise === "string") edges.push({ from: s.screen_key, to: c.otherwise, label: "if locked", kind: "otherwise" });
  }
  // Event interruptions may come from anywhere; draw them from the first screen they could follow.
  for (const e of events) if (e.goto) edges.push({ from: "__event", to: e.goto, label: `event: ${e.key}`, kind: "event" });
  return edges;
}

export function FlowMap({
  screens,
  events = [],
  flagged = [],
}: {
  screens: ScreenLite[];
  events?: { key: string; goto?: string }[];
  /** Screen keys with a blocking QA issue. */
  flagged?: string[];
}) {
  if (!screens.length) return null;
  const ordered = [...screens].sort((a, b) => a.sequence - b.sequence);
  const keys = new Set(ordered.map((s) => s.screen_key));
  const edges = buildEdges(ordered, events);

  // layers: shortest path from the first screen
  const layer = new Map<string, number>([[ordered[0].screen_key, 0]]);
  const queue = [ordered[0].screen_key];
  while (queue.length) {
    const k = queue.shift()!;
    for (const e of edges.filter((x) => x.from === k && keys.has(x.to))) {
      if (!layer.has(e.to)) { layer.set(e.to, layer.get(k)! + 1); queue.push(e.to); }
    }
  }
  const maxLayer = Math.max(0, ...layer.values());
  for (const s of ordered) if (!layer.has(s.screen_key)) layer.set(s.screen_key, maxLayer + 1); // unreachable

  const columns = new Map<number, ScreenLite[]>();
  for (const s of ordered) columns.set(layer.get(s.screen_key)!, [...(columns.get(layer.get(s.screen_key)!) ?? []), s]);
  const pos = new Map<string, { x: number; y: number }>();
  for (const [col, list] of columns) list.forEach((s, row) => pos.set(s.screen_key, { x: 16 + col * (W + GX), y: 16 + row * (H + GY) }));

  const incoming = new Map<string, Set<string>>();
  for (const e of edges) if (e.from !== "__event") incoming.set(e.to, new Set([...(incoming.get(e.to) ?? []), e.from]));
  const converges = (k: string) => (incoming.get(k)?.size ?? 0) >= 2;
  const gated = (s: ScreenLite) => Boolean((s.configuration as { requires?: unknown } | null)?.requires);

  const width = 32 + (Math.max(...columns.keys()) + 1) * (W + GX);
  const height = 32 + Math.max(...[...columns.values()].map((l) => l.length)) * (H + GY);

  return (
    <section aria-labelledby="flow-map" className="mt-[var(--space-xl)]">
      <h2 id="flow-map" className="text-[length:var(--text-h3)]">Flow</h2>
      <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Every way between screens. ◆ branches meet here · 🔒 shown only when its condition holds · ⚠ has a problem to fix.
      </p>
      <div className="mt-[var(--space-s)] overflow-x-auto rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <svg width={width} height={height} role="img" aria-label="Mission flow diagram; the same flow follows as a list" className="block">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--color-text-muted)" />
            </marker>
          </defs>
          {edges.filter((e) => pos.has(e.to) && (e.from === "__event" ? true : pos.has(e.from))).map((e, i) => {
            const b = pos.get(e.to)!;
            const a = e.from === "__event" ? { x: b.x - GX + 8, y: b.y - 14 } : pos.get(e.from)!;
            const x1 = e.from === "__event" ? a.x : a.x + W, y1 = a.y + H / 2;
            const x2 = b.x, y2 = b.y + H / 2;
            const back = x2 <= x1;
            const d = back
              ? `M${x1},${y1} C${x1 + 40},${y1 + 60} ${x2 - 40},${y2 + 60} ${x2},${y2}`
              : `M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}`;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="var(--color-text-muted)" strokeWidth={e.kind === "option" ? 1.6 : 1.1}
                  strokeDasharray={e.kind === "route" ? "5 3" : e.kind === "event" || e.kind === "otherwise" ? "2 3" : undefined} markerEnd="url(#arrow)" />
                {e.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fontSize="10" textAnchor="middle" fill="var(--color-text-muted)">{e.label.slice(0, 22)}</text>}
              </g>
            );
          })}
          {ordered.map((s) => {
            const p = pos.get(s.screen_key)!;
            const bad = flagged.includes(s.screen_key);
            return (
              <g key={s.screen_key} transform={`translate(${p.x},${p.y})`}>
                <rect width={W} height={H} rx="8" fill={s.type === "completion" ? "var(--color-surface-sage)" : "var(--color-surface-raised)"}
                  stroke={bad ? "var(--color-error)" : "var(--color-border-strong)"} strokeWidth={bad ? 2 : 1} />
                <text x="10" y="22" fontSize="12" fontWeight="600" fill="var(--color-text)">
                  {(converges(s.screen_key) ? "◆ " : "") + (gated(s) ? "🔒 " : "") + (bad ? "⚠ " : "") + (s.title || s.screen_key).slice(0, 22)}
                </text>
                <text x="10" y="42" fontSize="10" fill="var(--color-text-muted)">{s.screen_key} · {s.type.replace(/_/g, " ")}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <details className="mt-[var(--space-s)]">
        <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)]">Flow as a list</summary>
        <ul className="mt-[var(--space-xs)] flex flex-col gap-[4px] text-[length:var(--text-small)]">
          {ordered.map((s) => {
            const out = edges.filter((e) => e.from === s.screen_key);
            return (
              <li key={s.screen_key}>
                <strong>{s.title || s.screen_key}</strong> ({s.screen_key}){converges(s.screen_key) ? " — branches meet here" : ""}{gated(s) ? " — conditional" : ""}{flagged.includes(s.screen_key) ? " — has a problem" : ""}
                {out.length ? `: ${out.map((e) => `${e.label ? `${e.label} → ` : "→ "}${e.to}`).join("; ")}` : s.type === "completion" ? ": end" : ": no way on"}
              </li>
            );
          })}
          {events.filter((e) => e.goto).map((e) => <li key={e.key}>Event {e.key} interrupts to {e.goto}</li>)}
        </ul>
      </details>
    </section>
  );
}

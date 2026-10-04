import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, DataTable, Td, Stat } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/permissions";

export const metadata = { title: "Mission insights" };

type Insights = {
  starts: number; completions: number; runs: number; returned_runs: number; completed_after_return: number;
  by_version: { version: number; starts: number; completions: number }[];
  stops: { screen_key: string | null; runs: number }[];
  help: { screen_key: string; opens: number; repeated_runs: number }[];
  help_levels: Record<string, number>;
  branches: { screen_key: string; option: string; chosen: number }[];
  variants: Record<string, number>;
  events: Record<string, number>;
  friction: { screen_key: string; failures: number; retries: number; code_attempts: number }[];
  handoffs: Record<string, number>;
  qr_scans: number; kit_opens: number; trail_saves: number; fallbacks: number;
  devices: Record<string, number>;
  conversion: { free_then_paid: number; repeat_purchasers: number };
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/**
 * MISSION INSIGHTS — Enhancement Plan §13. Aggregates only (D-76): the per-run
 * key that sequences events never leaves admin_mission_insights.
 *
 * Each section answers one of the plan's questions: where children stop,
 * where they need repeated help, which branches and variants are used, which
 * interactions or handoffs create friction, and whether revisions help.
 */
export default async function MissionInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { slug } = await params;
  const { v } = await searchParams;
  const version = v && /^\d+$/.test(v) ? Number(v) : null;
  const { supabase } = await requireAdmin();
  const { data: mission } = await supabase.from("missions").select("id, title, slug").eq("slug", slug).maybeSingle();
  if (!mission) notFound();
  const { data } = await supabase.rpc("admin_mission_insights", { p_mission_id: mission.id, p_version: version });
  const i = (data ?? null) as unknown as Insights | null;
  if (!i) notFound();

  const table = (caption: string, columns: string[], rows: React.ReactNode[], empty: string) =>
    rows.length ? (
      <div className="mt-[var(--space-m)]"><DataTable caption={caption} columns={columns}>{rows}</DataTable></div>
    ) : (
      <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">{empty}</p>
    );

  return (
    <AdminPage
      title={mission.title}
      intro={version ? `Insights for version ${version}.` : "Insights across all versions."}
      action={<Link href="/admin/analytics" className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4">← Analytics</Link>}
    >
      <nav aria-label="Version" className="flex flex-wrap gap-[var(--space-s)]">
        <Link href={`/admin/analytics/${slug}`} aria-current={version === null ? "page" : undefined} className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4">All versions</Link>
        {i.by_version.map((b) => (
          <Link key={b.version} href={`/admin/analytics/${slug}?v=${b.version}`} aria-current={version === b.version ? "page" : undefined} className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4">v{b.version}</Link>
        ))}
      </nav>

      <div className="mt-[var(--space-l)] grid grid-cols-2 gap-[var(--space-m)] sm:grid-cols-4">
        <Stat label="Starts" value={i.starts} />
        <Stat label="Completions" value={i.completions} />
        <Stat label="Came back later" value={i.returned_runs} hint={`${pct(i.returned_runs, i.runs)} of runs`} />
        <Stat label="Finished after returning" value={i.completed_after_return} hint={pct(i.completed_after_return, i.returned_runs)} />
      </div>

      <section className="mt-[var(--space-2xl)]">
        <h2 className="text-[length:var(--text-h3)]">Where do children stop?</h2>
        {table("Where unfinished runs last arrived", ["Screen", "Runs"], i.stops.map((s, n) => <tr key={n}><Td>{s.screen_key ?? "—"}</Td><Td>{s.runs}</Td></tr>), "No unfinished runs yet.")}
      </section>

      <section className="mt-[var(--space-2xl)]">
        <h2 className="text-[length:var(--text-h3)]">Where do they need repeated help?</h2>
        {table("Mission Control use by screen", ["Screen", "Opens", "Runs that opened it twice or more"], i.help.map((h) => <tr key={h.screen_key}><Td>{h.screen_key}</Td><Td>{h.opens}</Td><Td>{h.repeated_runs}</Td></tr>), "Mission Control has not been opened yet.")}
        {Object.keys(i.help_levels).length > 0 && (
          <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            By support level: {Object.entries(i.help_levels).map(([l, n]) => `level ${l}: ${n}`).join(" · ")}
          </p>
        )}
      </section>

      <section className="mt-[var(--space-2xl)]">
        <h2 className="text-[length:var(--text-h3)]">Which branches and variants are used?</h2>
        {table("Choices made", ["Decision", "Option", "Chosen"], i.branches.map((b, n) => <tr key={n}><Td>{b.screen_key}</Td><Td>{b.option}</Td><Td>{b.chosen}</Td></tr>), "No decisions recorded yet.")}
        {Object.keys(i.variants).length > 0 && <p className="mt-[var(--space-s)]">Variants: {Object.entries(i.variants).map(([k, n]) => `${k} ${n}`).join(" · ")}</p>}
        {Object.keys(i.events).length > 0 && <p className="mt-[var(--space-s)]">Events fired: {Object.entries(i.events).map(([k, n]) => `${k} ${n}`).join(" · ")}</p>}
      </section>

      <section className="mt-[var(--space-2xl)]">
        <h2 className="text-[length:var(--text-h3)]">Which interactions or handoffs create friction?</h2>
        {table("Validation and retries by screen", ["Screen", "Not accepted", "Retries", "Code attempts"], i.friction.map((f) => <tr key={f.screen_key}><Td>{f.screen_key}</Td><Td>{f.failures}</Td><Td>{f.retries}</Td><Td>{f.code_attempts}</Td></tr>), "No validation failures or retries yet.")}
        <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Handoffs confirmed: {Object.values(i.handoffs).reduce((a, b) => a + b, 0)} · QR scans: {i.qr_scans} ·
          Mission Kit opened during a run: {i.kit_opens} · Trail saves: {i.trail_saves} · Device fallbacks: {i.fallbacks}
        </p>
      </section>

      <section className="mt-[var(--space-2xl)]">
        <h2 className="text-[length:var(--text-h3)]">Do revisions improve the experience?</h2>
        {table("By version", ["Version", "Starts", "Completions", "Completion rate"], i.by_version.map((b) => <tr key={b.version}><Td>v{b.version}</Td><Td>{b.starts}</Td><Td>{b.completions}</Td><Td>{pct(b.completions, b.starts)}</Td></tr>), "No runs yet.")}
        <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Devices: {Object.entries(i.devices).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"} ·
          Free → paid families: {i.conversion.free_then_paid} · Repeat purchasers: {i.conversion.repeat_purchasers}
        </p>
      </section>
    </AdminPage>
  );
}

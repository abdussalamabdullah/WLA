import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/permissions";
import { parseDefinition } from "@/features/mission-engine/definition";
import { PrintButton } from "@/components/admin/print-button";

export const metadata = { title: "QR codes" };

const ACTION: Record<string, string> = {
  open: "Opens the mission",
  resource: "Opens a Mission Kit resource",
  unlock: "Scan to reveal",
};

/**
 * PRINTABLE KIT QR CODES (Plan §5). One code per `definition.qr` entry, each
 * pointing at `/q/<mission>/<code>`, which resolves for whoever scans it —
 * the signed-in family's active child, or the child's own session.
 *
 * Draft and in-review versions only, like every authoring read (D-61): codes
 * carry only the mission slug and the code key, so a sheet printed from a
 * draft stays valid once that version is published.
 */
export default async function QrSheetPage({ params }: { params: Promise<{ slug: string; version: string }> }) {
  const { slug, version: v } = await params;
  const version = Number(v);
  if (!Number.isInteger(version) || version < 1) notFound();
  const { supabase } = await requireAdmin();
  const { data: mission } = await supabase.from("missions").select("id, title").eq("slug", slug).maybeSingle();
  if (!mission) notFound();
  const { data: def, error } = await supabase.rpc("admin_draft_definition", { p_mission_id: mission.id, p_version: version });
  if (error) notFound();
  const qr = parseDefinition(def).qr;

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const codes = await Promise.all(
    qr.map(async (q) => {
      const url = `${origin}/q/${slug}/${q.key}`;
      // The encoder needs literal colours; the dark modules become
      // currentColor (charcoal ink) and the light ones transparent (the paper).
      const svg = (await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#0000" } }))
        .replace(/#000000/g, "currentColor")
        .replace(/<svg /, `<svg role="img" aria-label="QR code for ${q.label.replace(/"/g, "")}" `);
      return { q, url, svg };
    }),
  );

  return (
    <main className="wla-container py-[var(--space-2xl)] print:py-0">
      <div className="print:hidden">
        <Link href={`/admin/builder/${slug}/${version}`} className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4">
          ← Back to the builder
        </Link>
      </div>
      <h1 className="mt-[var(--space-m)] text-[length:var(--text-h1)]">QR codes · {mission.title}</h1>
      <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)] print:hidden">
        Print these for the Mission Kit. Each opens this mission for whoever scans it — never another child&rsquo;s.
      </p>
      {codes.length === 0 ? (
        <p className="mt-[var(--space-l)] wla-measure">This version defines no QR codes. Add them under Mission logic → QR codes.</p>
      ) : (
        <>
          <div className="mt-[var(--space-m)] print:hidden"><PrintButton /></div>
          <ul className="mt-[var(--space-l)] grid gap-[var(--space-xl)] sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
            {codes.map(({ q, url, svg }) => (
              <li key={q.key} className="flex break-inside-avoid flex-col items-start gap-[var(--space-xs)]">
                <div className="w-[160px] text-[var(--color-text)]" dangerouslySetInnerHTML={{ __html: svg }} />
                <p className="font-medium">{q.label}</p>
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{ACTION[q.action]}{q.resource ? `: ${q.resource}` : ""}</p>
                <p className="break-all text-[length:var(--text-small)] text-[var(--color-text-muted)]">{url}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

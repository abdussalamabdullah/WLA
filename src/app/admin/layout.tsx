import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import wlaLogo from "../../../public/wla-logo-horizontal.png";
import { requireAdmin, AccessError } from "@/lib/permissions";
import { logAccessDenied } from "@/lib/observability/logger";

export const metadata = { title: "Content" };

/**
 * THE INTERNAL ADMIN — CMS-01.
 *
 * Tech Spec §39 forbids both a full custom CMS and an external one, and asks
 * for "the simplest suitable mechanism". This is it: the content already lives
 * in ordinary Postgres tables, so the admin is a small set of forms over those
 * tables and nothing else. No page builder, no block editor, no third party.
 *
 * It is gated here AND by RLS. This layout refuses a non-admin before any
 * child route renders; every admin table additionally carries an `is_admin()`
 * policy, so a request that somehow reached a server action would still be
 * refused at the database.
 *
 * Deliberately NOT a dashboard. It uses the same canvas, typefaces and
 * restraint as the Academy, because a tool the client uses weekly should feel
 * like the product it edits rather than like a different piece of software.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AccessError) {
      /*
       * A refused admin page is a security-relevant event, not an error. It is
       * logged without the account's identity and answered with a redirect
       * rather than a message — an interface that says "you are not an admin"
       * confirms the route exists.
       */
      logAccessDenied("admin_route", { reason: error.reason });
      redirect("/academy/my-missions");
    }
    throw error;
  }

  return (
    <>
      <header className="wla-band-raised border-b border-[var(--color-border)]">
        <div className="wla-container flex min-h-[80px] flex-wrap items-center justify-between gap-[var(--space-m)]">
          <div className="flex items-center gap-[var(--space-l)]">
            <Link href="/admin" className="flex items-center">
              <Image
                src={wlaLogo}
                alt="Within Lab Academy"
                priority
                className="h-[26px] w-auto sm:h-[30px]"
              />
            </Link>
            <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Content
            </span>
          </div>
          <Link
            href="/academy/my-missions"
            className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            Back to the Academy →
          </Link>
        </div>
      </header>
      {children}
    </>
  );
}

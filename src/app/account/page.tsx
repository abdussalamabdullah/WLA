import Link from "next/link";
import { ErrorState } from "@/components/system/states";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { listChildren } from "@/features/children/queries";
import { requireParent } from "@/lib/permissions";

export const metadata = { title: "Account" };

/**
 * Account overview. Not a parent dashboard (Brief §18) — it manages the
 * account and child profiles, and nothing else. Mission guidance lives in each
 * mission's For Parents, per Architecture §8.
 */
export default async function AccountPage() {
  let email: string | undefined;
  let childCount = 0;

  try {
    const { user } = await requireParent();
    email = user.email;
    childCount = (await listChildren()).length;
  } catch {
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState title="We couldn't load your account." />
      </main>
    );
  }

  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <h1 className="text-[length:var(--text-h1)]">Account</h1>

      <dl className="mt-[var(--space-xl)] border-t border-[var(--color-border)]">
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)] border-b border-[var(--color-border)] py-[var(--space-l)]">
          <dt className="text-[length:var(--text-label)] text-[var(--color-text-muted)]">
            Email
          </dt>
          <dd>{email}</dd>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)] border-b border-[var(--color-border)] py-[var(--space-l)]">
          <dt className="text-[length:var(--text-label)] text-[var(--color-text-muted)]">
            Child profiles
          </dt>
          <dd className="flex items-center gap-[var(--space-l)]">
            <span>{childCount}</span>
            <Link
              href="/account/children"
              className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              Manage
            </Link>
          </dd>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)] border-b border-[var(--color-border)] py-[var(--space-l)]">
          <dt className="text-[length:var(--text-label)] text-[var(--color-text-muted)]">
            Password
          </dt>
          <dd>
            <Link
              href="/forgot-password"
              className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              Change password
            </Link>
          </dd>
        </div>
      </dl>

      <form action={signOutAction} className="mt-[var(--space-xl)]">
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  );
}

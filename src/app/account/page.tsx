import Link from "next/link";
import { ErrorState } from "@/components/system/states";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { listChildren } from "@/features/children/queries";
import { requireParent } from "@/lib/permissions";
import { OpenChildMissions } from "@/components/account/open-child-missions";

export const metadata = { title: "Account" };

/**
 * Account overview. Not a parent dashboard (Brief §18) — it manages the
 * account and child profiles, and nothing else. Mission guidance lives in each
 * mission's For Parents, per Architecture §8.
 *
 * Enhancement Plan §1 adds two things here, on the account side: switching to
 * a child's missions, and the Family Mission Guide (D-75).
 */
export default async function AccountPage() {
  let email: string | undefined;
  let children: { id: string; display_name: string }[] = [];

  try {
    const { user } = await requireParent();
    email = user.email;
    children = await listChildren();
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
            <span>{children.length}</span>
            <Link
              href="/account/children"
              className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
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
              className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
            >
              Change password
            </Link>
          </dd>
        </div>
      </dl>

      {children.length > 0 && (
        <section aria-labelledby="account-children" className="mt-[var(--space-2xl)]">
          <h2 id="account-children" className="text-[length:var(--text-h3)]">Missions</h2>
          <ul className="mt-[var(--space-s)] flex flex-col">
            {children.map((c) => (
              <li key={c.id}>
                <OpenChildMissions childId={c.id} name={c.display_name} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/*
        Family Mission Guide — account side (Enhancement Plan §1, Architecture
        §3 as amended). Its approved text is a WLA authority document that is
        not in the repository yet (OPEN-15), so this states what the guide is
        and does not invent its content (D-75).
      */}
      <section aria-labelledby="family-guide" className="mt-[var(--space-2xl)] border-t border-[var(--color-border)] pt-[var(--space-l)]">
        <h2 id="family-guide" className="text-[length:var(--text-h3)]">Family Mission Guide</h2>
        <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
          How WLA missions work at home: choosing a child, My Missions, the
          Mission Kit and Mission Trail. The guide will be available here soon.
        </p>
      </section>

      <form action={signOutAction} className="mt-[var(--space-xl)]">
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  );
}

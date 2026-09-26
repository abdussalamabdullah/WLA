import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/system/states";
import { Button } from "@/components/ui/button";
import { RemoveChild } from "@/components/profile/remove-child";
import { listChildren } from "@/features/children/queries";

export const metadata = { title: "Child profiles" };

/**
 * Child profiles — Architecture §3, PRD §7.2.
 *
 * One parent account may hold several child profiles, each owning its own
 * missions, progress and Mission Trail. The copy says so, because the
 * separation is the product model, not an implementation detail.
 */
export default async function ChildrenPage() {
  let children;
  try {
    children = await listChildren();
  } catch {
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState title="We couldn't load these profiles." />
      </main>
    );
  }

  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-m)]">
        <div>
          <h1 className="text-[length:var(--text-h1)]">Child profiles</h1>
          <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
            Each child has their own missions, progress and Mission Trail.
          </p>
        </div>
        <Link href="/account/children/new">
          <Button>Add a profile</Button>
        </Link>
      </div>

      {children.length === 0 ? (
        <EmptyState
          title="No profiles yet"
          body="Add a profile for each child who'll be doing missions."
          action={{ label: "Add a profile", href: "/account/children/new" }}
        />
      ) : (
        <ul className="mt-[var(--space-xl)] border-t border-[var(--color-border)]">
          {children.map((child) => (
            <li
              key={child.id}
              className="flex flex-wrap items-center justify-between gap-[var(--space-m)] border-b border-[var(--color-border)] py-[var(--space-l)]"
            >
              <div>
                <p className="text-[length:var(--text-h3)]">
                  {child.display_name}
                </p>
                {child.birth_year && (
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    Born {child.birth_year}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-[var(--space-l)]">
                <Link
                  href={`/account/children/${child.id}`}
                  className="text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
                >
                  Edit
                </Link>
                <RemoveChild
                  childId={child.id}
                  displayName={child.display_name}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

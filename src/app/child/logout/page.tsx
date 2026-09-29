import { childLogoutAction } from "@/features/child-auth/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Log out" };

/**
 * Logging out is a POST, never a GET: a link that ends a session can be
 * triggered by a prefetch or a stray crawler. The form posts to a server
 * action which revokes the session in the database before clearing the cookie.
 */
export default function ChildLogoutPage() {
  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[26rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Log out</h1>
        <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">
          You&rsquo;ll need your child code to come back in.
        </p>
        <form action={childLogoutAction} className="mt-[var(--space-xl)]">
          <Button type="submit" size="large">Log out</Button>
        </form>
      </div>
    </main>
  );
}

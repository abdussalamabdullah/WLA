import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

export const metadata = { title: "Log out" };

/**
 * Parent log out. A POST, never a GET — see the child equivalent for why.
 */
export default function LogoutPage() {
  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[26rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Log out</h1>
        <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">
          You&rsquo;ll need to sign in again to manage your family.
        </p>
        <form action={signOutAction} className="mt-[var(--space-xl)]">
          <Button type="submit" size="large">Log out</Button>
        </form>
      </div>
    </main>
  );
}

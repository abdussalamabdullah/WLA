import { redirect } from "next/navigation";
import { ChildLoginForm } from "@/components/child/child-login-form";
import { getChildSession } from "@/lib/child-session";

export const metadata = { title: "Enter the Academy" };

/**
 * CHILD SIGN-IN — brief §6.
 *
 * No email, no password, no account creation, and no mention of the parent's
 * account. A child arriving here should see one thing to do.
 */
export default async function ChildLoginPage() {
  // Already signed in: don't show a sign-in form to someone who is.
  const existing = await getChildSession();
  if (existing) redirect("/academy/my-missions");

  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[26rem] py-[var(--space-2xl)]">
        <p className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
          WLA Academy
        </p>
        <h1 className="mt-[var(--space-l)] text-[length:var(--text-h1)]">
          Enter your child code
        </h1>
        <p className="mt-[var(--space-s)] wla-measure text-[var(--color-text-muted)]">
          Your code lets you open your own missions.
        </p>

        <div className="mt-[var(--space-xl)]">
          <ChildLoginForm />
        </div>
      </div>
    </main>
  );
}

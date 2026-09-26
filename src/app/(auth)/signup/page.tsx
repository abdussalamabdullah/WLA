import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-[length:var(--text-h1)]">Create an account</h1>
      {/* Architecture §3 — the account belongs to the adult, not the child. */}
      <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
        The account belongs to you as the parent or guardian. You&rsquo;ll add a
        profile for each child next.
      </p>

      <div className="mt-[var(--space-xl)]">
        <SignUpForm />
      </div>
    </>
  );
}

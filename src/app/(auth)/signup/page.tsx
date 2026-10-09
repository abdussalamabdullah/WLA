import { SignUpForm } from "@/components/auth/sign-up-form";
import { FormNotice } from "@/components/ui/field";

export const metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <>
      <h1 className="text-[length:var(--text-h1)]">Create an account</h1>
      {/* Architecture §3 — the account belongs to the adult, not the child. */}
      <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
        The account belongs to you as the parent or guardian. You&rsquo;ll add a
        profile for each child next.
      </p>

      {next?.startsWith("/purchase/") && (
        <div className="mt-[var(--space-l)]">
          <FormNotice message="Sign in or create an account to get this mission. We'll bring you straight back to it." />
        </div>
      )}

      <div className="mt-[var(--space-xl)]">
        <SignUpForm next={next} />
      </div>
    </>
  );
}

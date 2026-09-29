import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";
import { FormError } from "@/components/ui/field";

export const metadata = { title: "Sign in" };

const LINK_ERRORS: Record<string, string> = {
  link_expired: "That link has expired. Request a new one below.",
  link_invalid: "That link didn't work. Request a new one below.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <>
      <h1 className="text-[length:var(--text-h1)]">Sign in</h1>
      <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">
        Parents and guardians sign in here.{" "}
        {/* The only way in for a child sent here from an Academy link. */}
        <Link
          href="/child/login"
          className="text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-4"
        >
          Have a child code?
        </Link>
      </p>

      <div className="mt-[var(--space-xl)] flex flex-col gap-[var(--space-l)]">
        {error && <FormError message={LINK_ERRORS[error]} />}
        <SignInForm next={next} />
      </div>
    </>
  );
}

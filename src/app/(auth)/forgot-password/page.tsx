import { RequestResetForm } from "@/components/auth/reset-forms";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-[length:var(--text-h1)]">Reset your password</h1>
      <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
        We&rsquo;ll email you a link to set a new one.
      </p>

      <div className="mt-[var(--space-xl)]">
        <RequestResetForm />
      </div>
    </>
  );
}

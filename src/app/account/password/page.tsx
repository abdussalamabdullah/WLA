import { NewPasswordForm } from "@/components/auth/reset-forms";

export const metadata = { title: "Set a new password" };

/**
 * Reached from the reset email via /auth/callback, which has already
 * exchanged the code for a session. Middleware protects /account, so an
 * expired link lands on /login rather than here.
 */
export default function SetPasswordPage() {
  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[26rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Set a new password</h1>
        <div className="mt-[var(--space-xl)]">
          <NewPasswordForm />
        </div>
      </div>
    </main>
  );
}

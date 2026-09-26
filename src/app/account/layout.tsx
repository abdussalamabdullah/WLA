import Link from "next/link";

/**
 * ACCOUNT SHELL.
 *
 * Brief §18 / §6.1: the parent's experience should be "available when needed
 * without turning the Academy into a parent dashboard." So this sits beside
 * the Academy rather than inside it, and stays deliberately plain.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)]">
        <div className="wla-container flex min-h-[64px] items-center justify-between gap-[var(--space-m)]">
          <Link
            href="/academy/my-missions"
            className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]"
          >
            Within Lab Academy
          </Link>
          <Link
            href="/academy/my-missions"
            className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
          >
            Back to missions
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

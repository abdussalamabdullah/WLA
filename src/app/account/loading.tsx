import { LoadingState } from "@/components/system/states";

export default function AccountLoading() {
  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <LoadingState label="Loading your account…" lines={3} />
    </main>
  );
}

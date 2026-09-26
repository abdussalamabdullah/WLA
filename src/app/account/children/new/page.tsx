import { ChildForm } from "@/components/profile/child-form";

export const metadata = { title: "Add a child profile" };

export default function NewChildPage() {
  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[26rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Add a profile</h1>
        <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
          We only need enough to tell profiles apart.
        </p>
        <div className="mt-[var(--space-xl)]">
          <ChildForm />
        </div>
      </div>
    </main>
  );
}

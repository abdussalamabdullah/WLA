import { NewChildForm } from "@/components/profile/child-form";
import { safeNextOrNull } from "@/lib/safe-next";

export const metadata = { title: "Add a child profile" };

export default async function NewChildPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Where to carry on to afterwards, e.g. back to a mission being bought.
  const next = safeNextOrNull((await searchParams).next) ?? undefined;

  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[34rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Add a profile</h1>
        <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
          We only need enough to tell profiles apart.
        </p>
        <div className="mt-[var(--space-xl)]">
          <NewChildForm next={next} />
        </div>
      </div>
    </main>
  );
}

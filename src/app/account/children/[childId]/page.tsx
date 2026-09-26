import { notFound } from "next/navigation";
import { ChildForm } from "@/components/profile/child-form";
import { getChild } from "@/features/children/queries";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "Edit child profile" };

export default async function EditChildPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;

  let child;
  try {
    // Ownership is validated here — a child id from another family 404s.
    child = await getChild(childId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }

  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[26rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">{child.display_name}</h1>
        <div className="mt-[var(--space-xl)]">
          <ChildForm child={child} />
        </div>
      </div>
    </main>
  );
}

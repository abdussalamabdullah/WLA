import { notFound } from "next/navigation";
import { ChildForm } from "@/components/profile/child-form";
import { ChildAccessPanel } from "@/components/child/child-access-panel";
import { getChild } from "@/features/children/queries";
import { AccessError, requireOwnedChild } from "@/lib/permissions";

export const metadata = { title: "Manage child" };

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

  /*
   * Whether a code exists, and when it was last used.
   *
   * `code_hash` and `code_lookup` are absent from both the column grant and
   * the generated type, so this select cannot accidentally widen into the
   * secret material — it would not compile, and would not be permitted if it
   * did.
   */
  const { supabase } = await requireOwnedChild(childId);
  const { data: credential } = await supabase
    .from("child_access_credentials")
    .select("id, created_at, last_used_at, revoked_at")
    .eq("child_id", childId)
    .is("revoked_at", null)
    .maybeSingle();

  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[34rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">{child.display_name}</h1>
        <div className="mt-[var(--space-xl)]">
          <ChildForm child={child} />
        </div>

        <ChildAccessPanel
          childId={child.id}
          childName={child.display_name}
          access={{
            hasCode: Boolean(credential),
            createdAt: credential?.created_at ?? null,
            lastUsedAt: credential?.last_used_at ?? null,
          }}
        />
      </div>
    </main>
  );
}

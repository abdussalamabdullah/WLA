import { redirect } from "next/navigation";

import { AdminPage } from "@/components/admin/admin-page";
import { CategoryForm, DeleteCategoryButton } from "@/components/journal/studio/forms";
import { getCategories } from "@/features/journal/queries";
import { requireJournalStaff } from "@/lib/permissions/journal";

export const metadata = { title: "Categories · Journal studio" };

/** Website Master §5 names Essays, Reading Notes and Field Notes; editors create them here. */
export default async function CategoriesPage() {
  const { caps } = await requireJournalStaff();
  if (!caps.isEditor) redirect("/editorial");
  const categories = await getCategories();
  return (
    <AdminPage title="Categories" intro="The sections of the Journal. A category's name and description appear on the public Journal straight away; renaming one doesn't change any article's approved content.">
      <section aria-labelledby="add">
        <h2 id="add" className="text-[length:var(--text-h2)]">Add a category</h2>
        <div className="mt-[var(--space-m)] max-w-[48rem]"><CategoryForm /></div>
      </section>
      <section aria-labelledby="existing" className="mt-[var(--space-2xl)]">
        <h2 id="existing" className="text-[length:var(--text-h2)]">Categories</h2>
        {categories.length === 0 && <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">None yet.</p>}
        <ul className="mt-[var(--space-m)] flex max-w-[48rem] flex-col gap-[var(--space-xl)]">
          {categories.map((c) => (
            <li key={c.id} className="border-t border-[var(--color-border)] pt-[var(--space-m)]">
              <h3 className="text-[length:var(--text-h3)]">{c.name}</h3>
              <div className="mt-[var(--space-s)]"><CategoryForm category={c} /></div>
              <div className="mt-[var(--space-s)]"><DeleteCategoryButton id={c.id} name={c.name} /></div>
            </li>
          ))}
        </ul>
      </section>
    </AdminPage>
  );
}

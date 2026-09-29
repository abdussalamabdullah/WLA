import { AcademyShell } from "@/components/academy/academy-shell";

export const metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <AcademyShell>
      <main className="wla-container py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Help</h1>
        <div className="mt-[var(--space-l)] flex flex-col gap-[var(--space-l)] wla-measure">
          <section>
            <h2 className="text-[length:var(--text-h3)]">I can&rsquo;t open a mission</h2>
            <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
              Missions belong to one child. Check the name in the top right is
              the right one.
            </p>
          </section>
          <section>
            <h2 className="text-[length:var(--text-h3)]">My child code doesn&rsquo;t work</h2>
            <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
              Codes can be replaced. A parent can make a new one from Account →
              the child&rsquo;s page. Making a new code stops the old one working.
            </p>
          </section>
          <section>
            <h2 className="text-[length:var(--text-h3)]">Where did my work go?</h2>
            <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
              Missions save as you go. Leaving and coming back never loses your
              place.
            </p>
          </section>
        </div>
      </main>
    </AcademyShell>
  );
}

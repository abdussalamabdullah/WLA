import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin/admin-page";
import { screenCatalog } from "@/features/mission-engine/interactions/catalog";

export const metadata = { title: "Help" };

/**
 * Admin help (D-122). Each entry has a stable anchor, because the builder's
 * "What is this?" links point at them. The screen-type list is generated from
 * the engine's own catalogue, so it cannot describe a type that doesn't exist
 * or miss one that does.
 */

const TOPICS: { id: string; title: string }[] = [
  { id: "building", title: "How to build a mission" },
  { id: "screen-types", title: "Screen types" },
  { id: "branching", title: "How branching works" },
  { id: "completion", title: "How completion works" },
  { id: "kit-trail", title: "Mission Kit, For Parents and Mission Trail" },
  { id: "mission-logic", title: "Mission logic (advanced)" },
  { id: "preview", title: "Previewing a mission" },
  { id: "publishing", title: "Publishing a version vs. showing in the catalogue" },
  { id: "new-version", title: "Changing a live mission safely" },
  { id: "unsaved", title: "Saving your work" },
  { id: "faq", title: "Other questions" },
];

function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-[var(--space-xl)]">
      <h2 id={id} className="text-[length:var(--text-h3)]">{title}</h2>
      <div className="mt-[var(--space-xs)] flex flex-col gap-[var(--space-xs)] text-[var(--color-text-muted)]">{children}</div>
    </section>
  );
}

export default function AdminHelpPage() {
  const families = [...new Set(screenCatalog.map((e) => e.family))];

  return (
    <AdminPage title="Help" intro="How missions are built, checked and published, and how the Academy's moving parts fit together.">
      <div className="flex max-w-[60ch] flex-col gap-[var(--space-xl)]">
        <nav aria-label="Help topics">
          <ul className="flex flex-col">
            {TOPICS.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4">{t.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <Topic id="building" title="How to build a mission">
          <p>Start in <strong>Mission Builder</strong> with a title, a web address (which can&rsquo;t change later), a Lab and an age range. That creates version 1 as a draft.</p>
          <p>A draft&rsquo;s page has sections you can work on in any order. The index at the top shows each section&rsquo;s status from the automatic checks:</p>
          <ul className="list-disc pl-[var(--space-l)]">
            <li><strong>Details</strong>: description, price, cover and catalogue visibility, edited on the mission page.</li>
            <li><strong>Screens &amp; flow</strong>: the steps a child moves through. Start from a proven pattern, or add screens one at a time.</li>
            <li><strong>Mission logic</strong>: optional and advanced. Most missions don&rsquo;t need it.</li>
            <li><strong>Media</strong>: optional pictures, sound and video that screens show.</li>
            <li><strong>Kit &amp; For Parents</strong>: what WLA gives the family, and the note for the adult.</li>
            <li><strong>Completion</strong>: when the mission counts as finished.</li>
            <li><strong>Review &amp; publish</strong>: what still needs fixing, a preview, and publishing.</li>
          </ul>
          <p>Each screen&rsquo;s key (its internal name, which other screens use to point at it) is suggested from its title. You only need it under Advanced.</p>
        </Topic>

        <Topic id="screen-types" title="Screen types">
          <p>Each screen is one kind of step. Choose the one that matches what the child does:</p>
          {families.map((f) => (
            <div key={f}>
              <h3 className="mt-[var(--space-xs)] text-[length:var(--text-label)] font-medium text-[var(--color-text)]">{f}</h3>
              <ul className="list-disc pl-[var(--space-l)]">
                {screenCatalog.filter((e) => e.family === f).map((e) => <li key={e.type}>{e.label}</li>)}
              </ul>
            </div>
          ))}
          <p>Every mission ends on a <strong>Completion</strong> screen.</p>
        </Topic>

        <Topic id="branching" title="How branching works">
          <p>Every screen except the completion screen needs a way on. That&rsquo;s its <strong>Goes to</strong>, or on a <strong>Decision</strong> screen, a &ldquo;Goes to&rdquo; for each option. Different options can lead to different screens, and branches can meet again later.</p>
          <p>For more control, a screen&rsquo;s <strong>Where this screen leads</strong> settings add <strong>routes</strong>. After the child acts, routes are checked from the top, and the first one whose condition is true is taken. If none is, the child follows their chosen option or the screen&rsquo;s &ldquo;Goes to&rdquo;.</p>
          <p>Example: route 1 &ldquo;Variable torch is true → The cave&rdquo;, route 2 &ldquo;Always → The long way&rdquo;. A child with the torch goes to the cave; everyone else takes the long way. Swap the order and everyone takes the long way, because &ldquo;Always&rdquo; is always true.</p>
          <p><strong>Shown only when</strong> works the other way: a child who doesn&rsquo;t meet it skips the screen, going to its &ldquo;Otherwise goes to&rdquo; instead.</p>
          <p>The <strong>Flow map</strong> draws every connection; select a screen there to open it. The <strong>branch test</strong> under Review plays every combination of choices automatically and reports any that can&rsquo;t reach the end.</p>
        </Topic>

        <Topic id="completion" title="How completion works">
          <p>Usually a mission is complete when the child <strong>reaches the completion screen</strong>. Choose that screen in the Completion section; no code is needed.</p>
          <p>For anything else, such as needing an answer on a particular screen, use <strong>A custom rule (advanced)</strong>. It accepts these forms:</p>
          <ul className="list-disc pl-[var(--space-l)] font-mono text-[length:var(--text-small)] [overflow-wrap:anywhere]">
            <li>{`{"type":"screen_reached","screenKey":"the_end"}`}</li>
            <li>{`{"type":"conditions","conditions":[{"kind":"response_exists","screenKey":"…"}]}`}, where the kinds are response_exists, choice_exists, choice_equals (with optionId) and screen_visited, and all must hold</li>
            <li>{`{"type":"condition","when":{…}}`}, using the same conditions as routes</li>
          </ul>
          <p>There is a second, optional place: the <strong>completion condition in Mission logic</strong>. When it is set, it decides completion and the Completion section&rsquo;s rule is not used. The Completion section always says which one is in force.</p>
          <p>Learners keep the completion rule of the version they started on.</p>
        </Topic>

        <Topic id="kit-trail" title="Mission Kit, For Parents and Mission Trail">
          <p><strong>Mission Kit</strong> is what WLA <em>gives</em>: printables and resources. Opening, printing or downloading them never changes a child&rsquo;s progress. Physical and hybrid missions need at least one resource before they can be published.</p>
          <p><strong>For Parents</strong> is a note for the adult helping. It&rsquo;s never shown to the child. Every mission needs one, written as text; an attached PDF is optional.</p>
          <p><strong>Mission Trail</strong> is what the <em>child</em> makes along the way. It is private by default and configured on screens (the Trail settings under &ldquo;More behaviour&rdquo;), not uploaded here.</p>
          <p><strong>Media</strong> is different again: pictures and sound that appear on screens.</p>
        </Topic>

        <Topic id="mission-logic" title="Mission logic (advanced)">
          <p>Mission logic holds what a mission remembers, such as counters, clues or choices, and what changes as the child acts: unlocks, changing conditions, variants, randomisation, checkpoints, printables, QR codes and boards. Screens use it in their routes, conditions and effects.</p>
          <p>Most missions don&rsquo;t need it, so it is collapsed by default and opens itself if the checks find a problem there.</p>
        </Topic>

        <Topic id="preview" title="Previewing a mission">
          <p><strong>Preview as a learner</strong> plays the draft exactly as a child would see it, using the same mission engine, with nothing saved. No progress, evidence or purchase is created, and no real learner is affected.</p>
          <p><strong>Preview from here</strong>, on each screen, starts at that screen with a fresh test state, so choices from earlier screens won&rsquo;t have been made. The preview lists the path you took. Start again to try another branch.</p>
          <p>Only drafts can be previewed. A published version is seen by playing it.</p>
        </Topic>

        <Topic id="publishing" title="Publishing a version vs. showing in the catalogue">
          <p>These are two separate switches:</p>
          <ul className="list-disc pl-[var(--space-l)]">
            <li><strong>Publish version N for learners</strong> (in the builder) decides <em>which version</em> new learners get. The previous version is archived, not deleted, and anyone partway through it stays on it.</li>
            <li><strong>Show in catalogue (available to buy)</strong> (on the mission page) decides whether the mission <em>appears publicly</em> and can be bought. Families who already have it keep access either way.</li>
          </ul>
          <p>Publishing asks you to confirm, showing what will change. The checks run again at that moment, and nothing is published if they fail.</p>
          <p><strong>Mark as ready for review</strong> tells the team a draft is ready to be checked. It needs the automatic checks to pass, but it locks nothing and notifies no one, and publishing doesn&rsquo;t require it.</p>
        </Topic>

        <Topic id="new-version" title="Changing a live mission safely">
          <p>A published version can&rsquo;t be edited, because children keep the version they started on. To change it, open the published version and choose <strong>Create a new draft from version N</strong>, or use <strong>Create a new draft version</strong> on the mission page.</p>
          <p>The draft is a copy. Nothing changes for anyone until you publish it, and then only for learners who start after that.</p>
        </Topic>

        <Topic id="unsaved" title="Saving your work">
          <p>Each part of the builder has its own <strong>Save</strong>. &ldquo;Unsaved changes&rdquo; appears beside it until you save, and the builder asks before closing an editor, opening another screen, or leaving the page with unsaved work.</p>
          <p>The browser&rsquo;s Back button can&rsquo;t always be intercepted, so save before using it.</p>
        </Topic>

        <Topic id="faq" title="Other questions">
          <h3 className="text-[length:var(--text-label)] font-medium text-[var(--color-text)]">Why won&rsquo;t it let me publish?</h3>
          <p>Something would strand a learner: a choice pointing nowhere, a screen nothing reaches, or no way to finish. Review &amp; publish lists each one with a link to fix it.</p>
          <h3 className="text-[length:var(--text-label)] font-medium text-[var(--color-text)]">Can I delete a mission?</h3>
          <p>Only if no child has ever been given it, started it or produced anything in it. Otherwise archive it: it disappears for new learners and every existing record stays intact.</p>
        </Topic>
      </div>
    </AdminPage>
  );
}

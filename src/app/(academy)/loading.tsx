import { LoadingState } from "@/components/system/states";

/**
 * Academy loading state — UI/UX §53.
 *
 * "Loading should feel quiet. Avoid elaborate loaders." A skeleton with
 * reserved space, no spinner, no branded sequence.
 *
 * Next.js renders this while a server component streams, which is the only
 * point at which the learner would otherwise see nothing.
 */
export default function AcademyLoading() {
  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <LoadingState label="Loading your missions…" lines={4} />
    </main>
  );
}

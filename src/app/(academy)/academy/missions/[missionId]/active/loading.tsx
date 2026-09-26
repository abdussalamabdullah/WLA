import { RestoringState } from "@/components/system/states";

/**
 * Active Mission loading — Brief §40's "restoring" state.
 *
 * Distinct from ordinary loading because it reassures about persistence: the
 * child is returning to saved work, and the copy says so rather than showing
 * a neutral skeleton. Architecture §13 treats pause-and-return as normal use,
 * so this is the common path, not an edge case.
 */
export default function ActiveMissionLoading() {
  return (
    <main className="wla-container-narrow py-[var(--space-2xl)]">
      <RestoringState />
    </main>
  );
}

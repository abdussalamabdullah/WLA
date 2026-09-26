import { AcademyHeader } from "@/components/academy/academy-header";

/**
 * ACTIVE MISSION SHELL — UI/UX §17, §34–§35.
 *
 * §17: "The header should become visually quieter once the learner enters
 * Active Mission." The quiet header drops the profile control and the border.
 *
 * The Academy layout's header still renders above this one, so this layout
 * REPLACES rather than nests — see the route group structure. Kept separate so
 * the reduction is a property of the route, not a conditional in the shell.
 */
export default function ActiveMissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <AcademyHeader childProfiles={[]} activeChildId={null} variant="quiet" />
      {children}
    </div>
  );
}

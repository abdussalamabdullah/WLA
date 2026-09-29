import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/app-shell/app-shell";
import {
  IconMissions,
  IconBoard,
  IconAccount,
  IconHelp,
  IconLogout,
} from "@/components/app-shell/icons";
import { ProfileSwitcher } from "@/components/profile/profile-switcher";
import { resolveAcademyActor } from "@/features/academy/actor";
import { listChildren } from "@/features/children/queries";
import { getActiveChildId } from "@/features/children/active-child";

/**
 * The Academy shell for the two learner-facing actors.
 *
 * NOT used by Active Mission. Architecture §9 and UI/UX §33–§35 make that the
 * quietest surface in the product, and a persistent sidebar is the opposite of
 * quiet — it would put nine ways to leave beside the one thing the child is
 * meant to be doing. Active Mission keeps its own minimal chrome.
 *
 * The CHILD sidebar has no Account and no child switcher (brief §3). That is
 * not merely hidden: a child session cannot reach /account at all — middleware
 * sends it away and every parent query needs a parent session.
 */
export async function AcademyShell({ children }: { children: ReactNode }) {
  const actor = await resolveAcademyActor();

  if (actor.kind === "child") {
    const nav: NavItem[] = [
      { href: "/academy/my-missions", label: "My Missions", icon: <IconMissions />, prefix: true },
      { href: "/academy/mission-board", label: "Mission Board", icon: <IconBoard /> },
    ];
    const utility: NavItem[] = [
      { href: "/academy/help", label: "Help", icon: <IconHelp /> },
      { href: "/child/logout", label: "Log out", icon: <IconLogout /> },
    ];
    return (
      <AppShell
        nav={nav}
        utility={utility}
        identity={{ label: actor.session.displayName }}
      >
        {children}
      </AppShell>
    );
  }

  const nav: NavItem[] = [
    { href: "/academy/my-missions", label: "My Missions", icon: <IconMissions />, prefix: true },
    { href: "/academy/mission-board", label: "Mission Board", icon: <IconBoard /> },
    { href: "/account", label: "Account", icon: <IconAccount />, prefix: true },
  ];
  const utility: NavItem[] = [
    { href: "/academy/help", label: "Help", icon: <IconHelp /> },
    { href: "/logout", label: "Log out", icon: <IconLogout /> },
  ];

  // The switcher is only meaningful once a parent has more than one child, and
  // it renders nothing at all below that (UI/UX §19).
  const children_ = await listChildren().catch(() => []);
  const activeChildId = await getActiveChildId();
  const active = children_.find((c) => c.id === activeChildId);

  /*
   * The switcher already says whose missions are on screen, so when it is
   * present the identity label is left out. Rendering both put the child's
   * name on screen twice, side by side — "Bilal's Missions ⌄  Parent Bilal" —
   * which reads as a bug rather than as context. Caught in a screenshot; the
   * markup looked perfectly reasonable.
   */
  const hasSwitcher = children_.length > 1;

  return (
    <AppShell
      nav={nav}
      utility={utility}
      identity={
        hasSwitcher
          ? {
              label: "",
              action: (
                <ProfileSwitcher
                  childProfiles={children_.map((c) => ({
                    id: c.id,
                    display_name: c.display_name,
                  }))}
                  activeChildId={activeChildId}
                />
              ),
            }
          : { label: active?.display_name ?? "Choose a child", meta: "Parent" }
      }
    >
      {children}
    </AppShell>
  );
}

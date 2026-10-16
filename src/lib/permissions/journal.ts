import "server-only";

import { cache } from "react";

import { AccessError, requireParent, ServiceUnavailableError } from "@/lib/permissions";
import type { JournalRole } from "@/types/database";
import { logError } from "@/lib/observability/logger";

/**
 * THE JOURNAL STUDIO GATE (D-124).
 *
 * Journal staff sign in through the ordinary WLA login — there is no second
 * authentication system. A signed-in account is staff if it is an admin
 * (`profiles.is_admin`) or holds a `journal_staff` role.
 *
 * This decides what the studio SHOWS. It is not what protects the content:
 * every journal_* function re-derives the caller from `auth.uid()` and checks
 * the role again inside the database, so a crafted request that skips this
 * module is refused there (scripts/journal-regression.sql, section A).
 */
export type JournalCapabilities = {
  isAdmin: boolean;
  roles: JournalRole[];
  /** Create articles; edit the ones they author or collaborate on. */
  canWrite: boolean;
  /** Decide on revisions of articles they are assigned to. */
  canReview: boolean;
  /** Every article; assign, publish, schedule, archive, import, categories. */
  isEditor: boolean;
};

export function capabilitiesFor(isAdmin: boolean, roles: JournalRole[]): JournalCapabilities {
  const isEditor = isAdmin || roles.includes("editor");
  return {
    isAdmin,
    roles,
    isEditor,
    canWrite: isEditor || roles.includes("writer"),
    canReview: isEditor || roles.includes("reviewer"),
  };
}

export const requireJournalStaff = cache(async () => {
  const { supabase, user } = await requireParent();
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("id, email, name, is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("journal_staff").select("role").eq("profile_id", user.id),
  ]);
  if (profileResult.error || rolesResult.error) {
    logError("journal_permission_check_failed", profileResult.error ?? rolesResult.error, {
      profile: profileResult.error?.message ?? null,
      roles: rolesResult.error?.message ?? null,
    });
    throw new ServiceUnavailableError("requireJournalStaff");
  }
  const profile = profileResult.data;
  const roles = (rolesResult.data ?? []).map((r) => r.role);
  const caps = capabilitiesFor(Boolean(profile?.is_admin), roles);
  if (!profile || (!caps.isAdmin && roles.length === 0)) {
    throw new AccessError("Not Journal staff.", "not_journal_staff");
  }
  return { supabase, user, profile, caps };
});

export async function requireJournalEditor() {
  const staff = await requireJournalStaff();
  if (!staff.caps.isEditor) {
    throw new AccessError("Not a Journal editor.", "not_journal_staff");
  }
  return staff;
}

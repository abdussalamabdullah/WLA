import "server-only";

import { requireParent, requireOwnedChild } from "@/lib/permissions";
import type { ChildProfileRow } from "@/types/database";

/**
 * Child profile reads. All child-scoped table access goes through here or
 * through lib/permissions — never directly from a route or component.
 */

export async function listChildren(): Promise<ChildProfileRow[]> {
  const { supabase, user } = await requireParent();

  const { data } = await supabase
    .from("child_profiles")
    .select("*")
    .eq("parent_id", user.id) // ← family boundary, re-asserted in the query
    .order("created_at", { ascending: true });

  return data ?? [];
}

/** Single child. Throws AccessError if it is not this parent's. */
export async function getChild(childId: string): Promise<ChildProfileRow> {
  const { child } = await requireOwnedChild(childId);
  return child;
}

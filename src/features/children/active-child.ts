import "server-only";

import { cookies } from "next/headers";
import { requireOwnedChild } from "@/lib/permissions";
import { listChildren } from "./queries";

/**
 * ACTIVE CHILD — Tech Spec §8, Architecture §3.
 *
 * §8 says the active child "can be session/application state rather than
 * permanently storing an 'active child' field in the database", and that the
 * server must still validate access.
 *
 * Implemented as an httpOnly cookie rather than client state (decision D-07):
 * the browser can read neither the value nor swap it without going through
 * `setActiveChild`, which verifies ownership first. This is defence in depth —
 * `lib/permissions` re-verifies on every child-scoped query regardless.
 */

const COOKIE = "wla_active_child";

export async function getActiveChildId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

/**
 * Set the active child. Ownership is verified BEFORE the cookie is written, so
 * an id belonging to another family can never be stored.
 */
export async function setActiveChild(childId: string): Promise<void> {
  await requireOwnedChild(childId); // throws AccessError if not this parent's

  const store = await cookies();
  store.set(COOKIE, childId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function clearActiveChild(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/**
 * Resolve the child whose missions should be shown.
 *
 * Architecture §3: "Where more than one child profile exists, the active child
 * profile must be clear before mission access." A single-child account
 * resolves automatically; a multi-child account with nothing selected returns
 * `needsSelection` so the caller can show the selector rather than guess.
 */
export async function resolveActiveChild(): Promise<
  | { status: "ok"; childId: string }
  | {
      status: "needs_selection";
      children: { id: string; display_name: string }[];
    }
  | { status: "no_children" }
> {
  const children = await listChildren();
  if (children.length === 0) return { status: "no_children" };

  const stored = await getActiveChildId();
  if (stored && children.some((c) => c.id === stored)) {
    return { status: "ok", childId: stored };
  }

  if (children.length === 1) return { status: "ok", childId: children[0].id };

  return { status: "needs_selection", children };
}

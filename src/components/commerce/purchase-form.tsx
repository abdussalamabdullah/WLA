"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { acquireMissionAction } from "@/features/commerce/actions";
import { emptyFormState } from "@/features/auth/schemas";
import { cn } from "@/lib/utils";
import type { ChildProfileRow } from "@/types/database";

/**
 * Child selection before payment.
 *
 * Architecture §3: "Mission access must be associated with the intended child
 * profile before child-specific progress begins." The choice is made here,
 * explicitly, rather than inferred from whoever happens to be the active child
 * — a purchase is a deliberate act and deserves a deliberate choice.
 */
export function PurchaseForm({
  missionSlug,
  missionTitle,
  /** Rendered label only. The server re-reads the real price when charging. */
  priceLabel,
  isFree,
  childProfiles,
  alreadyOwnedBy,
}: {
  missionSlug: string;
  missionTitle: string;
  priceLabel: string;
  isFree: boolean;
  childProfiles: ChildProfileRow[];
  alreadyOwnedBy: string[];
}) {
  const action = acquireMissionAction.bind(null, missionSlug);
  const [state, formAction, isPending] = useActionState(action, emptyFormState);

  const available = childProfiles.filter((c) => !alreadyOwnedBy.includes(c.id));

  if (childProfiles.length === 0) {
    return (
      <div>
        <p className="wla-measure text-[var(--color-text-muted)]">
          Add a child profile first — missions belong to a child, not to the
          account.
        </p>
        <ButtonLink
          href="/account/children/new"
          className="mt-[var(--space-m)] inline-block"
        >
          Add a profile
        </ButtonLink>
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <p className="wla-measure text-[var(--color-text-muted)]">
        Everyone on this account already has {missionTitle}.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-[var(--space-l)]">
      <FormError message={state.error} />

      <fieldset className="flex flex-col gap-[var(--space-s)]">
        <legend className="mb-[var(--space-s)] text-[length:var(--text-label)] font-medium">
          Who is this mission for?
        </legend>

        {available.map((child, index) => (
          <label
            key={child.id}
            className={cn(
              "flex min-h-[var(--target-min)] cursor-pointer items-center gap-[var(--space-m)]",
              "rounded-[var(--radius-card)] border border-[var(--color-border)]",
              "bg-[var(--color-surface)] px-[var(--space-m)] py-[var(--space-sm)]",
              "has-[:checked]:border-[var(--color-primary)]",
              "has-[:checked]:bg-[var(--color-surface-sage)]",
            )}
          >
            <input
              type="radio"
              name="childId"
              value={child.id}
              defaultChecked={index === 0}
              required
              className="size-4 accent-[var(--color-primary)]"
            />
            <span>{child.display_name}</span>
          </label>
        ))}
      </fieldset>

      {alreadyOwnedBy.length > 0 && (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Profiles that already have this mission aren&rsquo;t shown.
        </p>
      )}

      <Button
        type="submit"
        size="large"
        isLoading={isPending}
        loadingLabel={isFree ? "Adding mission…" : "Taking you to payment…"}
      >
        {isFree ? "Add this mission" : `Continue to payment — ${priceLabel}`}
      </Button>

      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {isFree
          ? "This mission is free. It'll appear in My Missions straight away."
          : "Payment is handled by Stripe. The mission appears in My Missions once the payment is confirmed."}
      </p>
    </form>
  );
}

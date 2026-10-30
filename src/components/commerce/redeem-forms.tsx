"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import { emptyFormState } from "@/features/auth/schemas";
import { confirmGiftEmailAction, redeemGiftAction } from "@/features/gifts/actions";
import { cn } from "@/lib/utils";

/** "Confirm your email". One form for the email link and for the website link. */
export function ConfirmGiftEmailForm({ token }: { token?: string }) {
  const [state, action, isPending] = useActionState(confirmGiftEmailAction, emptyFormState);
  // Controlled: React clears an uncontrolled field after every form action, and
  // someone told "that isn't the address" should see what they typed.
  const [email, setEmail] = useState("");

  return (
    <form action={action} noValidate className="flex flex-col gap-[var(--space-l)]">
      {token && <input type="hidden" name="token" value={token} />}
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <Field label="Email address" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>
      <Button type="submit" size="large" isLoading={isPending} loadingLabel="Checking…">
        Confirm Email
      </Button>
    </form>
  );
}

/** Whose mission it becomes. Same shape as choosing a child when buying. */
export function RedeemGiftForm({
  missionTitle,
  childProfiles,
  alreadyOwnedBy,
}: {
  missionTitle: string;
  childProfiles: { id: string; display_name: string }[];
  alreadyOwnedBy: string[];
}) {
  const [state, action, isPending] = useActionState(redeemGiftAction, emptyFormState);
  const available = childProfiles.filter((c) => !alreadyOwnedBy.includes(c.id));
  const addProfile = `/account/children/new?next=${encodeURIComponent("/redeem")}`;

  if (childProfiles.length === 0) {
    return (
      <div>
        <p className="wla-measure text-[var(--color-text-muted)]">
          Add a child profile first — missions belong to a child, not to the account.
        </p>
        {/* Comes back here afterwards, so the gift isn't lost. */}
        <ButtonLink href={addProfile} className="mt-[var(--space-m)] inline-block">
          Add a profile
        </ButtonLink>
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <div>
        <p className="wla-measure text-[var(--color-text-muted)]">
          Everyone on this account already has {missionTitle}. The gift hasn&rsquo;t been used: add
          another profile to redeem it.
        </p>
        <ButtonLink href={addProfile} className="mt-[var(--space-m)] inline-block">
          Add a profile
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-[var(--space-l)]">
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
      <Button type="submit" size="large" isLoading={isPending} loadingLabel="Redeeming…">
        Redeem this gift
      </Button>
    </form>
  );
}

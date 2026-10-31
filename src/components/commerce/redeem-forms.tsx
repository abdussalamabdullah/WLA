"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import { emptyFormState } from "@/features/auth/schemas";
import {
  confirmGiftCodeAction,
  confirmGiftEmailAction,
  redeemGiftAction,
  requestGiftCodeAction,
  type GiftCodeState,
} from "@/features/gifts/actions";
import { ChildPicker } from "./child-picker";

/**
 * Redeem a Gift from the website, on one page (D-145): the address, then the code
 * emailed to it. The address stays in this component only, never in the URL or
 * browser storage, and the next step appears whether or not a gift exists.
 */
export function RedeemWithCodeForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [linkAsked, setLinkAsked] = useState(false);

  const [requestState, request, requesting] = useActionState(
    async (prev: GiftCodeState, formData: FormData) => {
      const result = await requestGiftCodeAction(prev, formData);
      if (result.email) {
        setAsked(result.email);
        setLinkAsked(false);
      }
      return result;
    },
    emptyFormState as GiftCodeState,
  );
  const [codeState, confirm, confirming] = useActionState(confirmGiftCodeAction, emptyFormState as GiftCodeState);
  const [, askForLink, askingForLink] = useActionState(async (prev: GiftCodeState, formData: FormData) => {
    const result = await confirmGiftEmailAction(prev, formData);
    setLinkAsked(true);
    return result;
  }, emptyFormState as GiftCodeState);

  if (!asked) {
    return (
      <form action={request} noValidate className="flex flex-col gap-[var(--space-l)]">
        <Field label="Email address" htmlFor="email" error={requestState.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={Boolean(requestState.fieldErrors?.email)}
          />
        </Field>
        <Button type="submit" size="large" isLoading={requesting} loadingLabel="Sending…">
          Email me a code
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-l)]">
      <form action={confirm} noValidate className="flex flex-col gap-[var(--space-l)]">
        <FormNotice message={requestState.notice} />
        <FormError message={codeState.error} />
        <input type="hidden" name="email" value={asked} />
        <Field label="Code from the email" htmlFor="code" error={codeState.fieldErrors?.code} hint="Eight characters. It lasts 15 minutes.">
          <Input
            id="code"
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            invalid={Boolean(codeState.fieldErrors?.code)}
          />
        </Field>
        <Button type="submit" size="large" isLoading={confirming} loadingLabel="Checking…">
          Confirm code
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-[var(--space-s)]">
        <form action={request}>
          <input type="hidden" name="email" value={asked} />
          <Button type="submit" variant="text" isLoading={requesting} loadingLabel="Sending…">
            Send a new code
          </Button>
        </form>
        <form action={askForLink}>
          <input type="hidden" name="email" value={asked} />
          <Button type="submit" variant="text" isLoading={askingForLink} loadingLabel="Sending…">
            Email me a link instead
          </Button>
        </form>
        <Button type="button" variant="text" onClick={() => { setAsked(null); setCode(""); }}>
          Use a different address
        </Button>
      </div>
      {linkAsked && (
        <FormNotice message="If a gift was sent to that address, we've emailed it a link to redeem it. Please check your inbox." />
      )}
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        A new code can be sent every two minutes. A new code replaces the last one.
      </p>
    </div>
  );
}

/** "Confirm your email", for someone who followed the link in their gift email. */
export function ConfirmGiftEmailForm({ token }: { token: string }) {
  const [state, action, isPending] = useActionState(confirmGiftEmailAction, emptyFormState);
  // Controlled: React clears an uncontrolled field after every form action, and
  // someone told "that isn't the address" should see what they typed.
  const [email, setEmail] = useState("");

  return (
    <form action={action} noValidate className="flex flex-col gap-[var(--space-l)]">
      <input type="hidden" name="token" value={token} />
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
  return (
    <ChildPicker
      childProfiles={childProfiles}
      alreadyOwnedBy={alreadyOwnedBy}
      missionTitle={missionTitle}
      allOwnedNote="The gift hasn’t been used: add another child to redeem it."
    >
      {(childId) => (
        <form action={action} className="flex flex-col gap-[var(--space-l)]">
          <FormError message={state.error} />
          <input type="hidden" name="childId" value={childId} />
          <Button type="submit" size="large" isLoading={isPending} loadingLabel="Redeeming…">
            Redeem this gift
          </Button>
        </form>
      )}
    </ChildPicker>
  );
}

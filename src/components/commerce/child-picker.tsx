"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { RevealedCode } from "@/components/child/revealed-code";
import { InlineNewChildForm } from "@/components/profile/child-form";
import type { CreateChildState } from "@/features/children/actions";
import { cn } from "@/lib/utils";

type Child = { id: string; display_name: string };
type Created = NonNullable<CreateChildState["created"]>;

/**
 * Who a mission is for: the one choice shared by buying and redeeming (D-144).
 *
 * Existing children, or "Add a new child" right here. A new child is selected
 * automatically, and their access code is on screen before the parent can leave
 * for Stripe. If the code can't be shown again, continuing waits until they say
 * they've saved it.
 *
 * It holds a selection and nothing more. `children` receives the chosen id only
 * when the parent can continue, and the server verifies it belongs to them. The
 * add form sits beside that form, not inside it, because forms can't nest.
 */
export function ChildPicker({
  childProfiles,
  alreadyOwnedBy,
  missionTitle,
  allOwnedAction,
  allOwnedNote,
  children,
}: {
  childProfiles: Child[];
  alreadyOwnedBy: string[];
  missionTitle: string;
  allOwnedAction?: ReactNode;
  allOwnedNote?: string;
  children: (childId: string) => ReactNode;
}) {
  // A new child is kept here until the refreshed page brings them in as a prop.
  const [added, setAdded] = useState<Child[]>([]);
  const everyone = [...childProfiles, ...added.filter((a) => !childProfiles.some((c) => c.id === a.id))];
  const available = everyone.filter((c) => !alreadyOwnedBy.includes(c.id));

  const [chosen, setChosen] = useState<string | null>(null);
  const selected = available.some((c) => c.id === chosen) ? chosen : (available[0]?.id ?? null);

  const hasNoChildren = everyone.length === 0;
  const [adding, setAdding] = useState(hasNoChildren);
  const [created, setCreated] = useState<Created | null>(null);
  const [saved, setSaved] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);

  function onCreated(child: Created) {
    setAdded((list) => [...list, { id: child.childId, display_name: child.name }]);
    setChosen(child.childId);
    setCreated(child);
    setSaved(false);
    setAdding(false);
  }

  const mustConfirmSaved = Boolean(created?.code && !created.viewable);
  const canContinue = Boolean(selected) && !adding && (!mustConfirmSaved || saved);

  return (
    <div className="flex flex-col gap-[var(--space-l)]">
      {hasNoChildren && (
        <p className="wla-measure text-[var(--color-text-muted)]">
          Add a child profile first — missions belong to a child, not to the account.
        </p>
      )}
      {!hasNoChildren && available.length === 0 && (
        <div>
          <p className="wla-measure text-[var(--color-text-muted)]">
            Everyone on this account already has {missionTitle}.{allOwnedNote ? ` ${allOwnedNote}` : ""}
          </p>
          {allOwnedAction}
        </div>
      )}

      {available.length > 0 && (
        <fieldset className="flex flex-col gap-[var(--space-s)]">
          <legend className="mb-[var(--space-s)] text-[length:var(--text-label)] font-medium">
            Who is this mission for?
          </legend>
          {available.map((child) => (
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
                name="childChoice"
                value={child.id}
                checked={selected === child.id}
                onChange={() => setChosen(child.id)}
                className="size-4 accent-[var(--color-primary)]"
              />
              <span>{child.display_name}</span>
            </label>
          ))}
        </fieldset>
      )}

      {alreadyOwnedBy.length > 0 && available.length > 0 && (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Profiles that already have this mission aren&rsquo;t shown.
        </p>
      )}

      {adding ? (
        <InlineNewChildForm
          onCreated={onCreated}
          focusOnOpen={!hasNoChildren}
          onCancel={
            hasNoChildren
              ? undefined
              : () => {
                  setAdding(false);
                  setTimeout(() => addButton.current?.focus(), 0);
                }
          }
        />
      ) : (
        <div>
          <Button ref={addButton} type="button" variant="secondary" onClick={() => setAdding(true)}>
            Add a new child
          </Button>
        </div>
      )}

      {created && !adding && (
        <div className="flex flex-col gap-[var(--space-m)]">
          <p role="status" className="font-medium">
            {created.name} has been added and selected.
          </p>
          {created.code ? (
            <RevealedCode
              code={created.code}
              childName={created.name}
              intro={`${created.name}’s access code.`}
              viewable={created.viewable}
            />
          ) : created.codeFailed ? (
            <FormError message={`We couldn't make ${created.name}'s code just now. You can make one from their profile.`} />
          ) : null}
          {mustConfirmSaved && (
            <label className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-[var(--space-s)]">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span>I&rsquo;ve saved this code</span>
            </label>
          )}
        </div>
      )}

      {canContinue && selected && children(selected)}
    </div>
  );
}

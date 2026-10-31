"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * A CHILD'S CODE ON SCREEN — brief §4/§25, D-143.
 *
 * Shared by the profile and by creating a child with a code, so all say the same
 * thing: what the code is for, where the child enters it, and whether it can be
 * shown again.
 *
 * Copy writes to the clipboard only. If the browser refuses (no permission, an
 * insecure context), the code is still on screen to write down, and the button
 * says it could not copy rather than pretending it did.
 */
export function RevealedCode({
  code,
  childName,
  intro,
  viewable = true,
}: {
  code: string;
  childName: string;
  /** The first line; defaults to the regenerate wording. */
  intro?: string;
  /** False when no encrypted copy could be stored, so this is the only sighting. */
  viewable?: boolean;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div className="rounded-[var(--radius-surface)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sage)] p-[var(--space-m)]">
      <p className="text-[length:var(--text-small)]">
        {intro ?? `${childName}’s new code.`}{" "}
        {viewable ? (
          <>Keep it somewhere safe. You can see it again from their profile.</>
        ) : (
          <>Write it down now &mdash; it can&rsquo;t be shown again.</>
        )}
      </p>
      <div className="mt-[var(--space-s)] flex flex-wrap items-center gap-x-[var(--space-m)] gap-y-[var(--space-xs)]">
        <p
          className="font-[family-name:var(--font-serif)] text-[length:var(--text-h1)] tracking-[0.12em]"
          data-testid="child-code"
        >
          {code}
        </p>
        <Button type="button" variant="secondary" onClick={copyCode}>
          Copy code
        </Button>
        {/* Announced, and in words — not a colour change on the button. */}
        <span role="status" className="text-[length:var(--text-small)]">
          {copy === "copied" && "Copied."}
          {copy === "failed" && "Couldn’t copy — please write it down."}
        </span>
      </div>
      <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Give this code to {childName}. They enter it at{" "}
        <Link href="/child/login" className="underline underline-offset-4">
          Child sign in
        </Link>
        . Generating a new code stops the old one working.
      </p>
    </div>
  );
}

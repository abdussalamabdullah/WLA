import "server-only";

/**
 * TRANSACTIONAL EMAIL — D-27.
 *
 * Scope is deliberately one message: a purchase/access confirmation sent after
 * the verified webhook creates an entitlement (PRD §4 lists transactional
 * purchase/access email in MVP scope).
 *
 * NOT in scope, and not to be added here: marketing, digests, reminders,
 * re-engagement, or notifications of any kind — Architecture §22 defers
 * notifications entirely.
 *
 * CONFIGURATION DEPENDENCY
 * Resend is the approved provider but no API key or verified sending domain
 * exists yet. Rather than fabricate credentials, this is the integration seam:
 * with RESEND_API_KEY and EMAIL_FROM set it sends; without them it records the
 * intent and returns. That keeps the call site honest and makes enabling email
 * a configuration change, not a code change.
 *
 * Both variables are read directly from process.env rather than through
 * serverEnv(), because serverEnv() validates its five variables together and
 * email must not become a hard requirement for payments to work.
 */

export type MissionAccessEmail = {
  /** The parent's address. Children never receive email — they have no account. */
  to: string;
  missionTitle: string;
  childName: string;
  /** Absolute link to that mission's permanent Mission Home (Architecture §5). */
  missionUrl: string;
};

/**
 * Confirm that a mission is now available to a child.
 *
 * NEVER throws. This is called from the Stripe webhook after the entitlement
 * has been created; a failed send must not fail the webhook, because Stripe
 * would retry and the entitlement is already correct. Losing an email is
 * recoverable — losing or duplicating an entitlement is not.
 */
export async function sendMissionAccessEmail(
  email: MissionAccessEmail,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    // Configuration pending, not an error.
    console.info("[email] not configured; would send mission access", {
      missionTitle: email.missionTitle,
      // No address, and no child name, in logs.
    });
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email.to,
        subject: `${email.childName} now has ${email.missionTitle}`,
        text: renderMissionAccessText(email),
      }),
    });

    if (!response.ok) {
      console.error("[email] send failed", { status: response.status });
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("[email] send threw", error);
    return { sent: false, reason: "exception" };
  }
}

/**
 * Plain text, deliberately.
 *
 * The message does one job: confirm access and provide the way in. No
 * marketing, no upsell — Architecture §14 keeps completion free of upsell and
 * the same restraint applies here.
 */
function renderMissionAccessText({
  missionTitle,
  childName,
  missionUrl,
}: MissionAccessEmail): string {
  return [
    `${childName} now has ${missionTitle}.`,
    "",
    "It's ready whenever they are. Everything they need is in the Mission Kit,",
    "and there's a short note for you under For Parents.",
    "",
    missionUrl,
    "",
    "Within Lab Academy",
  ].join("\n");
}

import "server-only";

/**
 * TRANSACTIONAL EMAIL — D-27.
 *
 * Scope is deliberately two messages: a purchase/access confirmation sent after
 * the verified webhook creates an entitlement (PRD §4 lists transactional
 * purchase/access email in MVP scope), and the gift redemption link (D-140).
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

export type GiftEmail = {
  /** The address the purchaser gave. Holds the only copy of the redeem link. */
  to: string;
  missionTitle: string;
  redeemUrl: string;
};

/**
 * Tell a recipient they have been given a mission, and how to redeem it.
 *
 * NEVER throws, for the same reason as above: it runs in the webhook after the
 * gift is already paid. The link is a credential, so it appears only in the
 * message body: nothing here logs the address, the URL or the provider's reply.
 */
export async function sendGiftEmail(
  email: GiftEmail,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info("[email] not configured; would send gift link", {
      missionTitle: email.missionTitle,
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
        subject: `You've been given ${email.missionTitle}`,
        text: renderGiftText(email),
      }),
    });

    if (!response.ok) {
      console.error("[email] gift send failed", { status: response.status });
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch {
    // Not the error itself: a network error can quote the request.
    console.error("[email] gift send threw");
    return { sent: false, reason: "exception" };
  }
}

function renderGiftText({ missionTitle, redeemUrl }: GiftEmail): string {
  return [
    `Someone has given you a Within Lab Academy mission: ${missionTitle}.`,
    "",
    "Redeem your gift:",
    redeemUrl,
    "",
    "You'll be asked to confirm this email address, then to sign in or create",
    "an account and choose the child the mission is for.",
    "",
    "Within Lab Academy",
  ].join("\n");
}

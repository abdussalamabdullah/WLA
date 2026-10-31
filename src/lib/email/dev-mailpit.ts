import "server-only";

/**
 * Local email, for `next dev` only (D-145).
 *
 * The local Supabase stack runs Mailpit, which catches mail and sends nothing on.
 * With no Resend configuration, `next dev` can deliver there so the gift journeys
 * can be walked locally. It needs WLA_DEV_MAILPIT_URL, a loopback address, and
 * NODE_ENV === "development". Next inlines NODE_ENV in a production build, so
 * this can't switch on in one whatever the environment says.
 */
export function devMailpitUrl(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV !== "development") return null;
  const raw = env.WLA_DEV_MAILPIT_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" ? url.origin : null;
  } catch {
    return null;
  }
}

export async function sendToMailpit(
  origin: string,
  mail: { to: string; subject: string; text: string },
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const response = await fetch(`${origin}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: "academy@wla.localhost", Name: "Within Lab Academy (local)" },
        To: [{ Email: mail.to }],
        Subject: mail.subject,
        Text: mail.text,
      }),
    });
    return response.ok ? { sent: true } : { sent: false, reason: `http_${response.status}` };
  } catch {
    return { sent: false, reason: "exception" };
  }
}

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sendMissionAccessEmail } from "../send";

const repo = join(__dirname, "../../../..");
const webhook = readFileSync(
  join(repo, "src/app/api/webhooks/stripe/route.ts"),
  "utf8",
);
const send = readFileSync(join(repo, "src/lib/email/send.ts"), "utf8");

const EMAIL = {
  to: "parent@example.com",
  missionTitle: "Six Names",
  childName: "Amina",
  missionUrl: "http://localhost:3000/academy/missions/six-names",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("transactional email", () => {
  it("skips cleanly when not configured, rather than failing", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    return expect(sendMissionAccessEmail(EMAIL)).resolves.toEqual({
      sent: false,
      reason: "not_configured",
    });
  });

  it("never logs the recipient or the child's name", () => {
    // Brief §46 — no unnecessary child information anywhere it needn't be.
    const logCall = send.slice(send.indexOf("console.info"), send.indexOf("return { sent: false, reason: \"not_configured\" }"));
    expect(logCall).not.toContain("email.to");
    expect(logCall).not.toContain("childName");
  });

  it("never throws, whatever the provider does", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "test@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(sendMissionAccessEmail(EMAIL)).resolves.toEqual({
      sent: false,
      reason: "exception",
    });
  });

  it("reports a non-2xx without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "test@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

    await expect(sendMissionAccessEmail(EMAIL)).resolves.toEqual({
      sent: false,
      reason: "http_422",
    });
  });

  it("sends when configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "test@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendMissionAccessEmail(EMAIL)).resolves.toEqual({ sent: true });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("parent@example.com");
    expect(body.subject).toBe("Amina now has Six Names");
    expect(body.text).toContain("Amina now has Six Names.");
    expect(body.text).toContain("/academy/missions/six-names");
  });

  it("carries no upsell or marketing", () => {
    // Architecture §14 keeps completion free of upsell; the same restraint
    // applies to the one transactional message.
    for (const forbidden of [/buy|discount|offer|upgrade|subscribe|unsubscribe/i]) {
      expect(send).not.toMatch(forbidden);
    }
  });
});

describe("email is wired after the entitlement, never before", () => {
  it("is sent only once the entitlement write has succeeded", () => {
    const grantAt = webhook.indexOf('from("mission_entitlements")');
    const emailAt = webhook.indexOf("notifyAccessGranted(");
    expect(grantAt).toBeGreaterThan(-1);
    expect(grantAt).toBeLessThan(emailAt);
  });

  it("a send failure cannot fail the webhook", () => {
    // Stripe retries on non-2xx; a retried webhook must not hinge on email.
    const helper = webhook.slice(webhook.indexOf("async function notifyAccessGranted"));
    expect(helper).toContain("try {");
    expect(helper).toContain("catch");
    expect(helper).not.toContain("status: 500");
  });

  it("no notification system was introduced", () => {
    /*
     * Architecture §22 defers notifications entirely.
     *
     * Checked against executable code, not prose — the module's own comment
     * names notifications in order to rule them out.
     */
    const code = send
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .toLowerCase();
    for (const forbidden of ["notification", "digest", "reminder", "campaign"]) {
      expect(code).not.toContain(forbidden);
    }
    // Exactly one exported send function — no message catalogue.
    expect(send.match(/^export (async )?function/gm)).toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Behavioural, not source-text: the action runs with a stubbed Supabase
 * client and we read what it returns. Found in staging browser QA — a valid
 * account was told "That email and password don't match" while GoTrue was
 * slow, because every error mapped to the credentials message.
 */
const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["host", "localhost"]]) }));
vi.mock("@/features/children/active-child", () => ({ clearActiveChild: vi.fn() }));

const { signInAction, signUpAction } = await import("../actions");

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const signIn = () => signInAction({}, form({ email: "p@example.com", password: "correct-horse-1" }));
const signUp = () => signUpAction({}, form({ name: "P", email: "p@example.com", password: "correct-horse-battery-1" }));
const err = (code: string) => ({ data: { session: null, user: null }, error: { code, message: code } });

beforeEach(() => vi.clearAllMocks());

describe("sign-in tells a parent the truth about why it failed", () => {
  it("wrong credentials keep the single, non-revealing message", async () => {
    auth.signInWithPassword.mockResolvedValue(err("invalid_credentials"));
    expect((await signIn()).error).toBe("That email and password don't match.");
  });

  it("an outage or timeout is NOT reported as a wrong password", async () => {
    for (const code of ["unexpected_failure", "request_timeout", "", "over_request_rate_limit"]) {
      auth.signInWithPassword.mockResolvedValue(err(code));
      expect((await signIn()).error).not.toMatch(/don't match/);
    }
  });

  it("rate limiting says to wait", async () => {
    auth.signInWithPassword.mockResolvedValue(err("over_request_rate_limit"));
    expect((await signIn()).error).toMatch(/wait/i);
  });
});

describe("sign-up does not say 'try again' when retrying cannot help", () => {
  it("an unusable address is flagged on the email field", async () => {
    auth.signUp.mockResolvedValue(err("email_address_invalid"));
    const r = await signUp();
    expect(r.fieldErrors?.email).toMatch(/can't be used/);
    expect(r.error).toBeUndefined();
  });

  it("an existing account stays generic, so existence is not revealed", async () => {
    auth.signUp.mockResolvedValue(err("user_already_exists"));
    expect((await signUp()).error).toBe("We couldn't create that account. Please try again.");
  });
});

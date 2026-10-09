import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { childProfileSchema } from "@/features/children/schemas";
import {
  signInSchema,
  signUpSchema,
  newPasswordSchema,
  fieldErrorsFrom,
} from "@/features/auth/schemas";

const root = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("auth validation", () => {
  it("rejects a malformed email", () => {
    const result = signInSchema.safeParse({ email: "nope", password: "x" });
    expect(result.success).toBe(false);
  });

  it("trims and accepts a valid sign-up", () => {
    const result = signUpSchema.safeParse({
      name: "  Sam  ",
      email: " parent@example.com ",
      password: "a-good-password",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("parent@example.com");
      expect(result.data.name).toBe("Sam");
    }
  });

  it("enforces the password floor", () => {
    expect(newPasswordSchema.safeParse({ password: "short" }).success).toBe(
      false,
    );
    expect(
      newPasswordSchema.safeParse({ password: "longenough" }).success,
    ).toBe(true);
  });

  it("reports one message per field", () => {
    const result = signUpSchema.safeParse({ email: "bad", password: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error);
      expect(Object.keys(errors).sort()).toEqual(["email", "password"]);
    }
  });
});

describe("child profile validation", () => {
  it("requires a name", () => {
    expect(childProfileSchema.safeParse({ displayName: "  " }).success).toBe(
      false,
    );
  });

  it("treats birth year as optional", () => {
    const result = childProfileSchema.safeParse({
      displayName: "Amina",
      birthYear: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a birth year in the future", () => {
    const next = new Date().getFullYear() + 1;
    const result = childProfileSchema.safeParse({
      displayName: "Amina",
      birthYear: String(next),
    });
    expect(result.success).toBe(false);
  });
});

/**
 * Guards for the auth properties that are easy to regress and expensive to
 * get wrong. Each asserts a specific decision, not just that code exists.
 */
describe("auth security properties", () => {
  const actions = read("features/auth/actions.ts");

  it("blocks open redirects through ?next=", () => {
    // Sign-in, sign-up and the email callback share one guard (lib/safe-next);
    // its behaviour is asserted in the security checkpoint, §8.
    expect(actions).toContain('import { safeNext, safeNextOrNull } from "@/lib/safe-next"');
    expect(actions).toContain('redirect(safeNext(formData.get("next")');
    expect(read("app/auth/callback/route.ts")).toContain("safeNext(next)");
  });

  it("does not reveal whether an account exists", () => {
    // Sign-in gives one message for both failure modes...
    expect(actions).toContain("That email and password don't match.");
    // ...and password reset always responds identically.
    expect(actions).toContain("If that email has an account");
  });

  it("clears the active child on sign out", () => {
    // Otherwise a shared device carries one family's selection into the next
    // session.
    const signOut = actions.slice(
      actions.indexOf("export async function signOutAction"),
    );
    expect(signOut).toContain("clearActiveChild()");
  });

  it("never takes parent_id from the form", () => {
    const children = read("features/children/actions.ts");
    expect(children).toContain("parent_id: user.id");
    expect(children).not.toContain('formData.get("parent_id")');
  });

  it("validates ownership before mutating a child profile", () => {
    const children = read("features/children/actions.ts");
    for (const fn of ["updateChildAction", "deleteChildAction"]) {
      const body = children.slice(
        children.indexOf(`export async function ${fn}`),
        children.indexOf(
          "}\n",
          children.indexOf(`export async function ${fn}`),
        ) + 2000,
      );
      expect(body, `${fn} must call requireOwnedChild`).toContain(
        "requireOwnedChild(childId)",
      );
    }
  });

  it("verifies the session against Supabase in middleware", () => {
    const mw = read("lib/supabase/middleware.ts");
    // getSession() trusts the cookie; getUser() revalidates.
    expect(mw).toContain("supabase.auth.getUser()");
    expect(mw).not.toContain("supabase.auth.getSession()");
  });

  it("protects the Academy and account routes", () => {
    const mw = read("lib/supabase/middleware.ts");
    expect(mw).toContain('"/academy"');
    expect(mw).toContain('"/account"');
  });
});

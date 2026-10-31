import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const reveal = vi.fn();
const revoke = vi.fn();
vi.mock("@/features/child-auth/parent-actions", () => ({
  generateChildCodeAction: (...a: unknown[]) => generate(...a),
  revealChildCodeAction: (...a: unknown[]) => reveal(...a),
  revokeChildCodeAction: (...a: unknown[]) => revoke(...a),
}));

import { ChildAccessPanel } from "../child-access-panel";

const CODE = "ABCD-2345";
const panel = (access: Partial<React.ComponentProps<typeof ChildAccessPanel>["access"]> = {}) =>
  render(
    <ChildAccessPanel
      childId="child-1"
      childName="Amina"
      access={{ hasCode: true, viewable: true, lastUsedAt: null, createdAt: null, ...access }}
    />,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Manage child: access code (D-143)", () => {
  it("doesn't hold the code until asked, then shows it with Copy", async () => {
    reveal.mockResolvedValue({ code: CODE, viewable: true });
    const { container } = panel();
    expect(container.textContent).not.toContain(CODE);
    fireEvent.click(screen.getByRole("button", { name: "Show access code" }));
    await waitFor(() => expect(screen.getByTestId("child-code").textContent).toBe(CODE));
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide code" }));
    expect(container.textContent).not.toContain(CODE);
  });

  it("an older code offers replacement instead of a Show button that can't work", () => {
    panel({ viewable: false });
    expect(screen.queryByRole("button", { name: "Show access code" })).toBeNull();
    expect(screen.getByText("Replace this code to be able to view it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate new access code" })).toBeTruthy();
  });

  it("Generate asks first, in full, and cancelling changes nothing", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Generate new access code" }));
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByText(/stop working immediately/)).toBeTruthy();
    expect(screen.getByText(/signed out/)).toBeTruthy();
    expect(screen.getByText(/give Amina the new code/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep the current code" }));
    expect(screen.queryByText(/stop working immediately/)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("confirming sends the confirmation and shows the new code", async () => {
    generate.mockResolvedValue({ code: CODE, viewable: true, replaced: true });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Generate new access code" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace the code" }));
    await waitFor(() => expect(screen.getByTestId("child-code").textContent).toBe(CODE));
    expect((generate.mock.calls[0][1] as FormData).get("confirmReplace")).toBe("yes");
    expect(screen.getByText(/old code has stopped working/)).toBeTruthy();
  });

  it("with no code, creating one needs no confirmation", () => {
    panel({ hasCode: false, viewable: false });
    expect(screen.getByRole("button", { name: "Create an access code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate new access code" })).toBeNull();
  });
});

import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/features/commerce/actions", () => ({ acquireMissionAction: vi.fn() }));
vi.mock("@/features/gifts/actions", () => ({ giftMissionAction: vi.fn() }));

import { PurchasePanel } from "../purchase-panel";

const base = {
  missionSlug: "six-names",
  missionTitle: "Six Names",
  priceLabel: "£12.00",
  isFree: false,
  childProfiles: [{ id: "c1", display_name: "Amina" }],
  alreadyOwnedBy: [],
} as unknown as React.ComponentProps<typeof PurchasePanel>;

const toggle = () => screen.getByRole("switch", { name: /Give as a gift\?/ });

describe("the gift toggle (D-140)", () => {
  it("is off by default: the ordinary purchase, no recipient field", () => {
    render(<PurchasePanel {...base} startAsGift={false} />);
    expect(toggle()).not.toBeChecked();
    expect(screen.queryByLabelText(/Recipient email/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Amina" })).toBeInTheDocument();
  });

  it("on reveals Recipient email and takes the child choice away; off restores it", () => {
    render(<PurchasePanel {...base} startAsGift={false} />);
    fireEvent.click(toggle());
    expect(screen.getByLabelText(/Recipient email/)).toBeRequired();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(toggle());
    expect(screen.queryByLabelText(/Recipient email/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Amina" })).toBeInTheDocument();
  });

  it("says on and off in words, not by colour alone", () => {
    render(<PurchasePanel {...base} startAsGift={false} />);
    expect(screen.getByText("Off")).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(screen.getByText("On")).toBeInTheDocument();
  });

  it("a purchaser with no children can still give a gift", () => {
    render(<PurchasePanel {...base} childProfiles={[]} startAsGift={false} />);
    expect(screen.getByText(/Add a child profile first/)).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(screen.getByLabelText(/Recipient email/)).toBeInTheDocument();
  });

  it("arriving from Buy a Gift starts on", () => {
    render(<PurchasePanel {...base} startAsGift />);
    expect(toggle()).toBeChecked();
  });

  it("a free mission isn't offered as a gift, whatever the link says", () => {
    render(<PurchasePanel {...base} isFree startAsGift />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Recipient email/)).not.toBeInTheDocument();
  });
});

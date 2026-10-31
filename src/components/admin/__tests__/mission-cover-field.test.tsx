import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const upload = vi.fn();
const register = vi.fn();
const discard = vi.fn();
vi.mock("@/features/journal/upload-client", () => ({
  uploadToStorage: (...a: unknown[]) => upload(...a),
  prepareImage: async (file: File, type: unknown) => ({ blob: file, type, resized: false }),
}));
vi.mock("@/features/admin/cover-actions", () => ({
  registerCoverUploadAction: (...a: unknown[]) => register(...a),
  discardCoverUploadAction: (...a: unknown[]) => discard(...a),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }),
}));

import { MissionCoverField } from "../mission-cover-field";

const ID = "11111111-2222-4333-8444-555555555555";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = new TextEncoder().encode("<svg></svg>");
const file = (bytes: Uint8Array, name: string, type: string) => {
  const f = new File([bytes as BlobPart], name, { type });
  // jsdom's File lacks a working slice().arrayBuffer() in some versions.
  Object.defineProperty(f, "slice", { value: () => ({ arrayBuffer: async () => bytes.buffer }) });
  return f;
};
const pick = (f: File) => fireEvent.change(screen.getByLabelText("Cover image file"), { target: { files: [f] } });
const hidden = () => document.querySelector<HTMLInputElement>("input[name=cover_image]")!;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  upload.mockResolvedValue(undefined);
  discard.mockResolvedValue(undefined);
  register.mockImplementation(async (_id: string, name: string) => ({ value: `mission-covers/${name}` }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("the mission cover field (D-146)", () => {
  it("offers no path to type", () => {
    render(<MissionCoverField missionId={ID} savedValue={null} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose image" })).toBeInTheDocument();
    expect(screen.getByText("No cover image yet.")).toBeInTheDocument();
  });

  it("uploads, previews the stored image, and changes only the form until Save", async () => {
    render(<MissionCoverField missionId={ID} savedValue={null} />);
    pick(file(PNG, "photo.png", "image/png"));
    await waitFor(() => expect(hidden().value).toMatch(new RegExp(`^mission-covers/${ID}/[a-f0-9]+\\.png$`)));
    expect(upload.mock.calls[0][0]).toMatchObject({ bucket: "mission-covers", contentType: "image/png" });
    expect(screen.getByAltText("Preview of the cover image")).toHaveAttribute(
      "src",
      `http://supabase.test/storage/v1/object/public/${hidden().value}`,
    );
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace image" })).toBeInTheDocument();
  });

  it("refuses an SVG in the browser before uploading anything", async () => {
    render(<MissionCoverField missionId={ID} savedValue={null} />);
    pick(file(SVG, "x.png", "image/png"));
    await screen.findByText("Use a PNG, JPEG or WebP image.");
    expect(upload).not.toHaveBeenCalled();
    expect(hidden().value).toBe("");
  });

  it("shows the server's refusal and keeps the value", async () => {
    register.mockResolvedValue({ error: "Use a PNG, JPEG or WebP image." });
    render(<MissionCoverField missionId={ID} savedValue="/missions/six-names.jpg" />);
    pick(file(PNG, "photo.png", "image/png"));
    await screen.findByText("Use a PNG, JPEG or WebP image.");
    expect(hidden().value).toBe("/missions/six-names.jpg");
  });

  it("removing clears the form without deleting the saved image", () => {
    render(<MissionCoverField missionId={ID} savedValue="/missions/six-names.jpg" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(hidden().value).toBe("");
    expect(discard).not.toHaveBeenCalled();
    expect(screen.getByText(/Press Save changes to remove/)).toBeInTheDocument();
  });

  it("replacing an unsaved upload deletes that upload, never the saved one", async () => {
    render(<MissionCoverField missionId={ID} savedValue={`mission-covers/${ID}/saved.png`} />);
    pick(file(PNG, "a.png", "image/png"));
    await waitFor(() => expect(hidden().value).not.toContain("saved"));
    const first = hidden().value;
    pick(file(PNG, "b.png", "image/png"));
    await waitFor(() => expect(hidden().value).not.toBe(first));
    expect(discard).toHaveBeenCalledExactlyOnceWith(ID, first);
  });

  it("tells the form the value changed, so Save and the unsaved warning cover it", async () => {
    const seen = vi.fn();
    render(
      <form onInput={seen}>
        <MissionCoverField missionId={ID} savedValue="/missions/six-names.jpg" />
      </form>,
    );
    expect(seen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    await waitFor(() => expect(seen).toHaveBeenCalled());
  });
});

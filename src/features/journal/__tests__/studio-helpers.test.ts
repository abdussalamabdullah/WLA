// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";

import { journalSiteOrigin, publicArticleUrl } from "../public-url";
import { studioStatusWords } from "../status";
import { isArticleMediaPath, MAX_IMAGE_BYTES, MAX_SOURCE_IMAGE_BYTES } from "../media";
import { checkPickedImage, newUploadPath, uploadFailureMessage } from "../upload-client";
import { prepareImport } from "../import-client";
import { IMPORT_BODY_LIMIT } from "../import-limits";

const ARTICLE = "0b8f3c2e-1d4a-4c8e-9f00-123456789abc";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
const file = (head: Uint8Array, size: number, name = "x.png") => {
  const bytes = new Uint8Array(size);
  bytes.set(head.slice(0, Math.min(head.length, size)));
  return new File([bytes], name);
};

afterEach(() => {
  delete process.env.NEXT_PUBLIC_JOURNAL_SITE_URL;
});

describe("links to a published article go to the public website (the 404, D-137)", () => {
  it("unset: no public link at all — never this app's /journal stub", () => {
    expect(publicArticleUrl("less-authority")).toBeNull();
    expect(journalSiteOrigin()).toBeNull();
  });
  it("set: the public website's /journal/<slug>", () => {
    process.env.NEXT_PUBLIC_JOURNAL_SITE_URL = "https://withinlab.example/";
    expect(publicArticleUrl("less-authority")).toBe("https://withinlab.example/journal/less-authority");
  });
  it("refuses a non-https address except a local one", () => {
    process.env.NEXT_PUBLIC_JOURNAL_SITE_URL = "http://withinlab.example";
    expect(publicArticleUrl("x")).toBeNull();
    process.env.NEXT_PUBLIC_JOURNAL_SITE_URL = "http://localhost:5173";
    expect(publicArticleUrl("x")).toBe("http://localhost:5173/journal/x");
    process.env.NEXT_PUBLIC_JOURNAL_SITE_URL = "javascript:alert(1)";
    expect(publicArticleUrl("x")).toBeNull();
  });
});

describe("status in words, without review states", () => {
  it.each([
    [{ status: "draft", pending: null }, "Draft"],
    [{ status: "in_review", pending: null }, "Draft"],
    [{ status: "approved", pending: null }, "Draft"],
    [{ status: "published", pending: null }, "Published"],
    [{ status: "published", pending: "draft" }, "Published · unpublished changes"],
    [{ status: "scheduled", pending: null }, "Scheduled"],
    [{ status: "archived", pending: null }, "Archived"],
  ] as const)("%o → %s", (s, words) => {
    expect(studioStatusWords(s)).toBe(words);
  });
});

describe("image uploads", () => {
  it("a new upload path is always inside the article's folder, and nothing else passes", () => {
    const path = newUploadPath(ARTICLE, "My Photo (final).JPG", "jpg");
    expect(isArticleMediaPath(ARTICLE, path)).toBe(true);
    expect(isArticleMediaPath(ARTICLE, `${ARTICLE}/../other/x.png`)).toBe(false);
    expect(isArticleMediaPath(ARTICLE, `ffffffff-1d4a-4c8e-9f00-123456789abc/x.png`)).toBe(false);
    expect(isArticleMediaPath(ARTICLE, `${ARTICLE}/x.svg`)).toBe(false);
    expect(isArticleMediaPath(ARTICLE, `${ARTICLE}/sub/x.png`)).toBe(false);
  });

  it("checks the real type, not the name, and the limits", async () => {
    expect(await checkPickedImage(file(PNG, 2048))).toEqual({ type: { mime: "image/png", ext: "png" } });
    expect(await checkPickedImage(file(strToU8("<svg xmlns='http://www.w3.org/2000/svg'><script/>"), 64, "evil.png"))).toEqual({ error: "Use a PNG, JPEG, WebP or GIF image." });
    expect(await checkPickedImage(file(PNG, 0))).toEqual({ error: "That file is empty." });
    const huge = await checkPickedImage(file(PNG, MAX_SOURCE_IMAGE_BYTES + 1));
    expect("error" in huge && huge.error).toMatch(/Choose one under 30 MB/);
  });

  it("a photo between 10 and 30 MB is accepted for resizing; a GIF over 10 MB is not (animation can't be resized here)", async () => {
    expect(await checkPickedImage(file(PNG, 12 * 1024 * 1024))).toEqual({ type: { mime: "image/png", ext: "png" } });
    const gif = await checkPickedImage(file(GIF, MAX_IMAGE_BYTES + 1, "a.gif"));
    expect("error" in gif && gif.error).toMatch(/Animated GIFs/);
  });

  it("storage refusals become plain words", () => {
    expect(uploadFailureMessage(413, "")).toBe("That image is larger than 10 MB.");
    expect(uploadFailureMessage(400, '{"error":"Payload too large","message":"The object exceeded the maximum allowed size"}')).toBe("That image is larger than 10 MB.");
    expect(uploadFailureMessage(400, '{"message":"mime type image/svg+xml is not supported"}')).toBe("Use a PNG, JPEG, WebP or GIF image.");
    expect(uploadFailureMessage(403, '{"message":"new row violates row-level security policy"}')).toMatch(/can't add images to this article/);
    expect(uploadFailureMessage(0, "")).toMatch(/interrupted/);
    expect(uploadFailureMessage(500, "boom")).toBe("The image couldn't be uploaded. Try again.");
  });
});

describe("Medium import: a large export is reduced to its posts in the browser", () => {
  const html = (t: string) => strToU8(`<html><body><h1>${t}</h1></body></html>`);

  it("a small upload goes as it is", async () => {
    const zip = new File([zipSync({ "posts/2019_a.html": html("A") }) as BlobPart], "export.zip");
    const r = await prepareImport([zip]);
    expect("files" in r && r.reduced).toBe(false);
  });

  it("a large .zip travels as its posts/*.html only", async () => {
    const filler = new Uint8Array(IMPORT_BODY_LIMIT + 1024).map((_, i) => (i * 7919) % 251);
    const zip = new File([zipSync({ "posts/2019_a.html": html("A"), "posts/draft_b.html": html("B"), "profile/big.bin": [filler, { level: 0 }] }) as BlobPart], "export.zip");
    expect(zip.size).toBeGreaterThan(IMPORT_BODY_LIMIT);
    const r = await prepareImport([zip]);
    expect("files" in r).toBe(true);
    if ("files" in r) {
      expect(r.reduced).toBe(true);
      expect(r.files.map((f) => f.name).sort()).toEqual(["2019_a.html", "draft_b.html"]);
    }
  });

  it("anything but .zip or .html is refused before upload", async () => {
    const r = await prepareImport([new File(["x"], "notes.txt")]);
    expect(r).toEqual({ error: "Choose Medium's export .zip, or post .html files from its posts folder." });
  });
});

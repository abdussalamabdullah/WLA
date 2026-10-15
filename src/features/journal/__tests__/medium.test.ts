// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { sanitizeArticleHtml } from "../content";
import { parseMediumPost, placeImages, readExport, type ParsedPost } from "../medium";

/*
 * Fixtures follow the markup of Medium's "Download your information" export
 * (h-entry, .graf paragraphs, figure/figcaption, p-author, dt-published,
 * p-canonical). No real export was available (OPEN-23), so these are built
 * to that documented format, including its awkward parts: the repeated title
 * and subtitle, section dividers, embeds, link cards and the export date.
 */
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
const POST = "posts/2019-04-02_Less-Authority-1a2b3c4d5e6f.html";
const DRAFT = "posts/draft_Unfinished-thought-0f0e0d0c0b0a.html";

function parse(file = POST, html = fixture(file.replace("posts/", ""))): ParsedPost {
  const p = parseMediumPost(file, html);
  if ("error" in p) throw new Error(p.error);
  return p;
}

describe("Medium metadata", () => {
  const p = parse();
  it("reads title, subtitle, author, original date and canonical URL", () => {
    expect(p.title).toBe("Less Authority");
    expect(p.excerpt).toBe("What writing taught me about attention & correction.");
    expect(p.authorName).toBe("Within Lab Academy");
    expect(p.publishedAt).toBe("2019-04-02T10:15:23.123Z");
    expect(p.canonicalUrl).toBe("https://medium.com/@wla/less-authority-1a2b3c4d5e6f");
    expect(p.isDraft).toBe(false);
  });
  it("identifies the post by Medium's id and derives the slug without it", () => {
    expect(p.sourceId).toBe("1a2b3c4d5e6f");
    expect(p.slug).toBe("less-authority");
  });
  it("recognises a draft (draft_ file, no publication date) and still finds its id", () => {
    const d = parse(DRAFT);
    expect(d.isDraft).toBe(true);
    expect(d.sourceId).toBe("0f0e0d0c0b0a");
    expect(d.messages.map((m) => m.text).join(" ")).toMatch(/unpublished draft/);
  });
});

describe("Medium formatting → Journal HTML", () => {
  const p = parse();
  const body = sanitizeArticleHtml(placeImages(p.bodyWithMarkers, p.images, new Map([[0, { url: "/api/journal/media/0b8f3c2e-1d4a-4c8e-9f00-123456789abc" }]])));

  it("drops the title and subtitle Medium repeats inside the body", () => {
    expect(body).not.toContain("Less Authority");
    expect(body).not.toContain("What writing taught me");
  });
  it("keeps bold, italic, headings (one level down), quotes, lists and code", () => {
    expect(body).toContain("<p>Creativity did not make the noise <strong>disappear</strong>. It gave it <em>less</em> authority.</p>");
    expect(body).toContain("<h2>Staying with it</h2>");
    expect(body).toContain("<blockquote>Notice closely.</blockquote>");
    expect(body).toContain("<ul><li>One</li><li>Two</li></ul>");
    expect(body).toContain("<pre>if (a &lt; b) { go(); }</pre>");
  });
  it("keeps links, drops the javascript: one, and turns a link card into a link", () => {
    expect(body).toContain('<a href="https://example.org/notes" rel="noopener noreferrer">my notes</a>');
    expect(body).not.toContain("javascript");
    expect(body).toContain('<p><a href="https://example.org/reading" rel="noopener noreferrer">Reading Notes</a></p>');
  });
  it("places the downloaded image with its caption", () => {
    expect(body).toContain('<figure><img src="/api/journal/media/0b8f3c2e-1d4a-4c8e-9f00-123456789abc" alt="" /><figcaption>A desk by the window</figcaption></figure>');
  });
  it("never keeps scripts, handlers or embeds", () => {
    expect(body).not.toMatch(/script|onclick|iframe|steal/);
    expect(body).toContain("<p>The end.</p>");
  });
  it("turns a section break into a rule, but not before the first section", () => {
    expect(body).toMatch(/<p>The end\.<\/p><hr \/><p>After the break\.<\/p>$/);
    expect(body.startsWith("<hr")).toBe(false);
  });
});

describe("what needs a person is reported", () => {
  const p = parse();
  const report = p.messages.map((m) => `${m.level}: ${m.text}`).join("\n");
  it("flags the embed it could not import, with where it was", () => {
    expect(report).toMatch(/warning: An embedded item .* was not imported \(after “….*”\)/);
  });
  it("flags images without alt text, and the link back to Medium", () => {
    expect(report).toMatch(/Image 1 .* has no alt text/);
    expect(report).toMatch(/info: A link points back to Medium/);
  });
  it("flags the unusable link it removed", () => {
    expect(report).toMatch(/unusable address and was removed: javascript:alert\(1\)/);
  });
  it("records the first image (before any text) as the lead image", () => {
    expect(p.leadImage).toBe(0);
    expect(p.images.map((i) => i.src)).toEqual([
      "https://cdn-images-1.medium.com/max/800/1*hero.jpeg",
      "https://evil.example.com/track.png",
    ]);
  });
});

describe("re-exports of the same post match (duplicate detection)", () => {
  it("the export date in the footer does not change the source hash", () => {
    const a = parse();
    const b = parse(POST, fixture("2019-04-02_Less-Authority-1a2b3c4d5e6f.html").replace("October 1, 2026", "March 3, 2027"));
    expect(b.sourceHash).toBe(a.sourceHash);
  });
  it("an edit on Medium does change it", () => {
    const b = parse(POST, fixture("2019-04-02_Less-Authority-1a2b3c4d5e6f.html").replace("The end.", "The very end."));
    expect(b.sourceHash).not.toBe(parse().sourceHash);
  });
});

describe("failures are reported, not thrown", () => {
  it("a file that isn't a Medium post", () => {
    expect(parseMediumPost("posts/x.html", "<html><body><p>hello</p></body></html>")).toEqual({ file: "posts/x.html", error: "This file doesn't look like a Medium post." });
  });
  it("a post whose id cannot be found", () => {
    const html = fixture("2019-04-02_Less-Authority-1a2b3c4d5e6f.html").replace(/1a2b3c4d5e6f/g, "");
    const r = parseMediumPost("posts/no-id.html", html);
    expect("error" in r && r.error).toMatch(/post id/);
  });
});

describe("reading the export", () => {
  it("takes posts/*.html out of Medium's zip and ignores everything else", () => {
    const zip = zipSync({
      "posts/2019-04-02_Less-Authority-1a2b3c4d5e6f.html": strToU8(fixture("2019-04-02_Less-Authority-1a2b3c4d5e6f.html")),
      "profile/profile.html": strToU8("<p>me</p>"),
      "README.html": strToU8("<p>readme</p>"),
    });
    const { files, problems } = readExport([{ name: "medium-export.zip", bytes: zip }]);
    expect(files.map((f) => f.name)).toEqual(["posts/2019-04-02_Less-Authority-1a2b3c4d5e6f.html"]);
    expect(problems).toEqual([]);
  });
  it("accepts loose .html files and reports anything else", () => {
    const { files, problems } = readExport([
      { name: "a.html", bytes: strToU8("<p>a</p>") },
      { name: "notes.txt", bytes: strToU8("x") },
      { name: "broken.zip", bytes: strToU8("not a zip") },
    ]);
    expect(files.map((f) => f.name)).toEqual(["a.html"]);
    expect(problems.join("\n")).toMatch(/notes\.txt: not a \.zip or \.html file/);
    expect(problems.join("\n")).toMatch(/broken\.zip: this isn't a readable zip file/);
  });
  it("a zip with no posts says so", () => {
    const { problems } = readExport([{ name: "other.zip", bytes: zipSync({ "x.txt": strToU8("x") }) }]);
    expect(problems[0]).toMatch(/no posts\/\*\.html files/);
  });
});

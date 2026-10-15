// @vitest-environment node
import { describe, expect, it } from "vitest";

import { htmlToText, normaliseTags, readingMinutes, sanitizeArticleHtml, slugify, slugProblem, wordCount } from "../content";
import { articleStatus } from "../status";
import { journalErrorMessage } from "../errors";

const MEDIA = "/api/journal/media/0b8f3c2e-1d4a-4c8e-9f00-123456789abc";

describe("article HTML is reduced to the Journal allowlist (D-123)", () => {
  it("keeps the formatting the editor produces", () => {
    const html = `<h2>Heading</h2><p>A <strong>bold</strong>, <em>italic</em>, <u>u</u>, <s>s</s> and <code>x</code> line.</p>
      <blockquote><p>Quote</p></blockquote><ul><li>One</li></ul><ol start="3"><li>Three</li></ol><pre>code</pre><hr>
      <figure><img src="${MEDIA}" alt="A desk"><figcaption>Caption</figcaption></figure>`;
    const out = sanitizeArticleHtml(html);
    for (const tag of ["<h2>", "<strong>", "<em>", "<u>", "<s>", "<code>", "<blockquote>", "<ul>", '<ol start="3">', "<pre>", "<hr />", "<figure>", "<figcaption>"]) {
      expect(out).toContain(tag);
    }
    expect(out).toContain(`<img src="${MEDIA}" alt="A desk" />`);
  });

  it("removes scripts, handlers, styles, frames and javascript: links", () => {
    const out = sanitizeArticleHtml(
      `<p onclick="x()" style="color:red">Hi<script>alert(1)</script></p><iframe src="https://e.vil"></iframe>` +
        `<a href="javascript:alert(1)">bad</a><a href="data:text/html,<b>x</b>">data</a><svg><script>1</script></svg><style>p{}</style>`,
    );
    expect(out).not.toMatch(/script|onclick|style=|iframe|javascript:|data:|svg/i);
    expect(out).toContain("<p>Hi</p>");
    expect(out).toContain("bad");
  });

  it("keeps only WLA media images; hotlinked and data: images are dropped", () => {
    const out = sanitizeArticleHtml(
      `<img src="https://tracker.example/pixel.gif" alt="x"><img src="data:image/png;base64,AAAA" alt="y"><img src="/api/journal/media/not-a-uuid" alt="z"><img src="${MEDIA}" alt="ok">`,
    );
    expect(out).toBe(`<img src="${MEDIA}" alt="ok" />`);
  });

  it("demotes h1 (the page title) and normalises b/i", () => {
    expect(sanitizeArticleHtml("<h1>T</h1><b>b</b><i>i</i>")).toBe("<h2>T</h2><strong>b</strong><em>i</em>");
  });

  it("gives external links rel=noopener noreferrer and drops target", () => {
    expect(sanitizeArticleHtml('<a href="https://x.org" target="_blank" onmouseover="y">x</a>')).toBe(
      '<a href="https://x.org" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeArticleHtml('<a href="/journal/other">x</a>')).toBe('<a href="/journal/other">x</a>');
  });

  it("escapes text that looks like markup", () => {
    expect(sanitizeArticleHtml("<p>if a &lt; b &amp;&amp; c &gt; d</p>")).toBe("<p>if a &lt; b &amp;&amp; c &gt; d</p>");
  });

  it("drops empty paragraphs the editor leaves behind", () => {
    expect(sanitizeArticleHtml("<p></p><p>Text</p><p><br></p>")).toBe("<p>Text</p>");
  });
});

describe("text, slugs, tags and reading time", () => {
  it("extracts plain text", () => {
    expect(htmlToText("<h2>A</h2><p>b &amp; c</p>")).toBe("A b & c");
    expect(wordCount("one two  three")).toBe(3);
  });
  it("reading time is at least a minute", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(1150)).toBe(5);
  });
  it("slugs match the database rule and avoid reserved words", () => {
    expect(slugify("What Helps Children Become More Independent?")).toBe("what-helps-children-become-more-independent");
    expect(slugify("Café & Crème — Notes")).toBe("cafe-and-creme-notes");
    expect(slugify("Search")).toBe("search-article");
    expect(slugProblem("search")).toMatch(/used by the Journal/);
    expect(slugProblem("Bad Slug")).toMatch(/lower-case/);
    expect(slugProblem("good-slug")).toBeNull();
  });
  it("tags are normalised to unique slugs", () => {
    expect(normaliseTags("Reading Notes, attention ,reading notes,,")).toEqual(["attention", "reading-notes"]);
  });
});

describe("the seven editorial states are derived, never stored twice (D-126)", () => {
  const base = { archived_at: null, live_revision_id: null, scheduled_for: null, working_revision_id: "w" };
  it.each([
    ["draft", "draft"],
    ["in_review", "in_review"],
    ["changes_requested", "changes_requested"],
    ["approved", "approved"],
  ] as const)("working %s → %s", (state, status) => {
    expect(articleStatus(base, { id: "w", state }).status).toBe(status);
  });
  it("scheduled, published (with pending changes) and archived", () => {
    expect(articleStatus({ ...base, scheduled_for: "2030-01-01" }, { id: "w", state: "approved" }).status).toBe("scheduled");
    expect(articleStatus({ ...base, live_revision_id: "w" }, { id: "w", state: "live" })).toEqual({ status: "published", pending: null });
    expect(articleStatus({ ...base, live_revision_id: "l" }, { id: "w", state: "in_review" })).toEqual({ status: "published", pending: "in_review" });
    expect(articleStatus({ ...base, archived_at: "x", live_revision_id: "l" }, { id: "w", state: "draft" }).status).toBe("archived");
  });
});

describe("database refusals in an editor's words", () => {
  it("maps known codes and hides unknown text", () => {
    expect(journalErrorMessage({ message: "own_changes" })).toMatch(/don't need a review to publish/);
    expect(journalErrorMessage({ message: "relation journal_x does not exist" })).toBe("That didn't work. Please try again.");
  });
});

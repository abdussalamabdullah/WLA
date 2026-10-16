import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sanitizeArticleHtml } from "../content";
import { normalisePastedHtml } from "../paste";

/*
 * What a Google Docs copy puts on the clipboard (text/html), in Docs' own
 * shape: a `docs-internal-guid` <b style="font-weight:normal"> wrapper,
 * formatting as span STYLES, <br> between paragraphs, <li><p> lists, a soft
 * line break as <br> inside a paragraph. Plus a hostile tail.
 */
const DOCS = readFileSync(join(__dirname, "fixtures/google-docs-clipboard.html"), "utf8");

describe("pasting from Google Docs", () => {
  const out = normalisePastedHtml(DOCS);

  it("keeps the structure: title → h2, Docs H1/H2/H3 → h2/h3/h4", () => {
    expect(out).toContain("<h2>Notes from the Morning Walk</h2>");
    expect(out).toContain("<h2>Why walk at all</h2>");
    expect(out).toContain("<h3>What I carried</h3>");
    expect(out).toContain("<h4>In order</h4>");
    expect(out).not.toMatch(/<h1/);
  });

  it("turns styled spans into bold, italic and underline; keeps the link, without a stray underline", () => {
    expect(out).toContain("<strong>bold words</strong>");
    expect(out).toContain("<em>italic words</em>");
    expect(out).toContain('<a href="https://example.org/walking">a link</a>');
    expect(out).toContain("<u>Underlined</u>");
    expect(out).toContain("<li><strong>A pencil</strong></li>");
  });

  it("the Docs wrapper does not make everything bold", () => {
    expect(out).not.toMatch(/^<strong>/);
    expect(out).toContain("<p>The second paragraph follows a blank line.</p>");
  });

  it("no doubled spacing: blank-line <br>s and empty paragraphs are gone; one <p> per paragraph", () => {
    expect(out).not.toMatch(/<\/(p|ul|ol|h\d)>\s*<br/);
    expect(out).not.toMatch(/<p>\s*<\/p>|<p><br><\/p>/);
    expect(out.match(/<p>/g)?.length).toBe(5); // four paragraphs + the unsafe link's kept text
  });

  it("a deliberate line break inside a paragraph is kept", () => {
    expect(out).toContain("<p><u>Underlined</u> and a line<br>break inside it.</p>");
  });

  it("lists stay lists, one item per line", () => {
    expect(out).toContain("<ul><li>A notebook</li><li><strong>A pencil</strong></li></ul>");
    expect(out).toContain("<ol><li>Leave early</li><li>Come back slowly</li></ol>");
  });

  it("no style, class, dir, id, role or aria attribute survives", () => {
    expect(out).not.toMatch(/\s(style|class|dir|id|role|aria-[a-z]+)=/);
  });

  it("scripts, event handlers and javascript: links are removed; the text stays", () => {
    expect(out).not.toMatch(/script|onclick|javascript:|__pwned/);
    expect(out).toContain("<p>Unsafe link text</p>");
  });

  it("what is left passes the server's sanitiser unchanged (nothing more to strip)", () => {
    expect(sanitizeArticleHtml(out)).toBe(out.replace(/<br>/g, "<br />").replace(/<a href="([^"]+)">/g, '<a href="$1" rel="noopener noreferrer">'));
  });
});

describe("other sources", () => {
  it("Word: mso leftovers and <o:p> go; bold/italic tags are kept", () => {
    const word = `<p class="MsoNormal" style="margin-bottom:0cm"><b>Bold</b> and <i>italic</i><o:p></o:p></p><p class="MsoNormal"><o:p>&nbsp;</o:p></p><p class="MsoNormal">Next<o:p></o:p></p>`;
    expect(normalisePastedHtml(word)).toBe("<p><strong>Bold</strong> and <em>italic</em></p><p>Next</p>");
  });

  it("a web page: divs become paragraphs, Google's redirect links are unwrapped", () => {
    const page = `<div>First line</div><div><br></div><div>Second <a href="https://www.google.com/url?q=https://example.org/x&amp;sa=D">link</a></div>`;
    expect(normalisePastedHtml(page)).toBe('<p>First line</p><p>Second <a href="https://example.org/x">link</a></p>');
  });

  it("images: http(s) and raster data: sources are kept for the editor to upload; anything else is dropped", () => {
    const html = `<p>a</p><img src="https://lh7-rt.googleusercontent.com/docsz/abc" alt="Docs image"><img src="data:image/png;base64,iVBORw0KGgo="><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="file:///C:/x.png">`;
    const out = normalisePastedHtml(html);
    expect(out).toContain('<img src="https://lh7-rt.googleusercontent.com/docsz/abc" alt="Docs image">');
    expect(out).toContain('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(out).not.toMatch(/svg\+xml|file:/);
  });
});

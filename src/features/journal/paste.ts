/**
 * PASTED RICH TEXT → JOURNAL HTML (D-138).
 *
 * Google Docs (and Word, and most web pages) put formatting on the clipboard
 * as inline STYLES, not tags, and Docs separates paragraphs with stray <br>
 * elements. Pasted as-is, bold and italic were lost, Docs' H1 had no place in
 * an article whose title is already the page's h1, and every blank line
 * became an empty paragraph — the doubled spacing.
 *
 * This keeps the meaning and drops the presentation:
 *   - styles become tags: weight ≥ 600 → <strong>, italic → <em>,
 *     underline (outside links) → <u>, line-through → <s>
 *   - Docs' wrapper `<b style="font-weight:normal" id="docs-internal-guid-…">`
 *     is unwrapped (it is not bold)
 *   - headings step down one level (H1 → h2, H2 → h3, H3+ → h4); a short
 *     paragraph set in a title-sized font (≥ 20pt, Docs' "Title") → h2
 *   - <br> between blocks and empty paragraphs are removed; a <br> INSIDE a
 *     paragraph (a deliberate line break) is kept
 *   - links keep http(s), mailto and relative addresses (Google's redirect
 *     wrapper is unwrapped); anything else loses the link, keeps the text
 *   - images keep http(s) or raster data: sources, to be uploaded into the
 *     article by the editor (never left pointing elsewhere)
 *   - every other attribute, and script/style/iframe/object/embed/svg/form
 *     elements, are removed
 *
 * The editor's schema and the server's sanitiser (content.ts) still decide
 * what is stored; this only makes pasted documents arrive as documents.
 */

const DROP = "script,style,iframe,object,embed,svg,math,form,input,button,select,textarea,noscript,template,meta,link,title,head";
const KEEP_ATTRS: Record<string, string[]> = { A: ["href"], IMG: ["src", "alt"], OL: ["start"] };
const BLOCKS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "HR", "FIGURE", "TABLE", "DIV"]);
const SAFE_IMG = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i;

function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  let href = raw.trim();
  // Google's click-tracking redirect (copied from a published Doc or search result).
  try {
    const u = new URL(href);
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === "/url") href = u.searchParams.get("q") ?? u.searchParams.get("url") ?? href;
  } catch {
    /* relative or not a URL */
  }
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? href : null;
}

const pt = (v: string | undefined): number => {
  if (!v) return 0;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return 0;
  return /px$/i.test(v) ? n * 0.75 : n;
};

function unwrap(el: Element) {
  el.replaceWith(...Array.from(el.childNodes));
}

function wrapChildren(el: Element, tag: string) {
  const w = el.ownerDocument.createElement(tag);
  while (el.firstChild) w.appendChild(el.firstChild);
  el.appendChild(w);
}

function isEmptyBlock(el: Element): boolean {
  if (el.querySelector("img, hr")) return false;
  return (el.textContent ?? "").replace(/[\s ​]/g, "") === "";
}

export function normalisePastedHtml(html: string): string {
  if (!html || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  root.querySelectorAll(DROP).forEach((e) => e.remove());
  // Word's namespaced leftovers (<o:p>) and comments.
  root.querySelectorAll("*").forEach((e) => { if (e.tagName.includes(":")) unwrap(e); });
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));

  // Docs' wrapper is a <b> with font-weight:normal: not bold.
  root.querySelectorAll("b, strong").forEach((b) => {
    const w = (b as HTMLElement).style.fontWeight;
    if (/^(normal|[1-4]00)$/.test(w) || (b.id ?? "").startsWith("docs-internal-guid")) unwrap(b);
  });

  // Title-sized paragraphs (Docs' "Title" style) become headings, before styles are dropped.
  root.querySelectorAll("p").forEach((p) => {
    const sizes = [p, ...Array.from(p.querySelectorAll("span"))].map((e) => pt((e as HTMLElement).style.fontSize)).filter(Boolean);
    const text = (p.textContent ?? "").trim();
    if (sizes.length && Math.max(...sizes) >= 20 && text && text.length <= 200 && !p.querySelector("img")) {
      const h = doc.createElement("h2");
      h.setAttribute("data-kept", ""); // already at its final level
      h.append(...Array.from(p.childNodes));
      p.replaceWith(h);
    }
  });

  // Inline styles → semantic tags.
  root.querySelectorAll("span, font, a, b, i, u, s, strong, em, p, li, h1, h2, h3, h4, h5, h6, td, th").forEach((el) => {
    const s = (el as HTMLElement).style;
    if (!s) return;
    const weight = s.fontWeight;
    const bold = /^(bold|bolder|[6-9]00)$/i.test(weight);
    const italic = /italic|oblique/i.test(s.fontStyle);
    const deco = `${s.textDecoration} ${s.textDecorationLine}`;
    const underline = /underline/i.test(deco) && !el.closest("a");
    const strike = /line-through/i.test(deco);
    // Wrap the element's contents (spans are unwrapped afterwards, so the mark survives them).
    if (bold && !el.closest("h1, h2, h3, h4, h5, h6, strong, b")) wrapChildren(el, "strong");
    if (italic && !el.closest("em, i")) wrapChildren(el, "em");
    if (underline && !el.closest("u")) wrapChildren(el, "u");
    if (strike && !el.closest("s, del, strike")) wrapChildren(el, "s");
  });
  root.querySelectorAll("span, font").forEach(unwrap);
  root.querySelectorAll("b").forEach((b) => { const s = doc.createElement("strong"); s.append(...Array.from(b.childNodes)); b.replaceWith(s); });
  root.querySelectorAll("i").forEach((b) => { const s = doc.createElement("em"); s.append(...Array.from(b.childNodes)); b.replaceWith(s); });
  root.querySelectorAll("del, strike").forEach((b) => { const s = doc.createElement("s"); s.append(...Array.from(b.childNodes)); b.replaceWith(s); });

  // Headings: the article's title is the page's h1, so pasted levels step down one.
  const remap: Record<string, string> = { H1: "h2", H2: "h3", H3: "h4", H4: "h4", H5: "h4", H6: "h4" };
  Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .filter((h) => h.getAttribute("data-kept") === null)
    .forEach((h) => {
      const n = doc.createElement(remap[h.tagName]);
      n.append(...Array.from(h.childNodes));
      h.replaceWith(n);
    });

  // Links and images.
  root.querySelectorAll("a").forEach((a) => {
    const href = safeHref(a.getAttribute("href"));
    if (!href) return unwrap(a);
    a.setAttribute("href", href);
  });
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!SAFE_IMG.test(src) && !/^\/api\/journal\/media\/[0-9a-f-]{36}$/.test(src)) img.remove();
  });

  // Paragraph boundaries: <br> between blocks and empty paragraphs go;
  // a <br> inside a paragraph is a deliberate line break and stays.
  root.querySelectorAll("br").forEach((br) => {
    if (br.classList.contains("Apple-interchange-newline")) return br.remove();
    const parent = br.parentElement;
    if (!parent || parent === root || parent.tagName === "UL" || parent.tagName === "OL" || parent.tagName === "BLOCKQUOTE" || parent.tagName === "DIV") br.remove();
  });
  root.querySelectorAll("p, h2, h3, h4, li, blockquote").forEach((el) => {
    // Trailing and leading <br> inside a block add a blank line nobody asked for.
    while (el.lastChild && el.lastChild.nodeName === "BR") el.lastChild.remove();
    while (el.firstChild && el.firstChild.nodeName === "BR") el.firstChild.remove();
  });
  root.querySelectorAll("p, h2, h3, h4, blockquote, li").forEach((el) => { if (isEmptyBlock(el)) el.remove(); });
  // Docs wraps each list item's text in a <p>: one paragraph per item is enough.
  root.querySelectorAll("li > p:only-child").forEach(unwrap);
  // Blocks a page wraps in <div>: keep them, as paragraphs when they hold only text.
  root.querySelectorAll("div").forEach((d) => {
    const hasBlock = Array.from(d.children).some((c) => BLOCKS.has(c.tagName));
    if (hasBlock) unwrap(d);
    else if (isEmptyBlock(d)) d.remove();
    else { const p = doc.createElement("p"); p.append(...Array.from(d.childNodes)); d.replaceWith(p); }
  });

  // Finally: no attributes except the few that carry meaning.
  root.querySelectorAll("*").forEach((el) => {
    const keep = KEEP_ATTRS[el.tagName] ?? [];
    for (const attr of Array.from(el.attributes)) if (!keep.includes(attr.name)) el.removeAttribute(attr.name);
  });
  // Formatting marks left empty by the above.
  root.querySelectorAll("strong, em, u, s").forEach((el) => { if (!el.textContent && !el.querySelector("img, br")) el.remove(); });

  return root.innerHTML.trim();
}

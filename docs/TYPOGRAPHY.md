# WLA Typography

**Approved faces (D-33, 2026-09-26):**

- **Fraunces** — display and headings
- **Karla** — body, interface, labels, navigation, buttons

Do not substitute either. Both are loaded as variable fonts in
`src/app/layout.tsx`; tokens live in `src/styles/tokens.css`.

---

## How these values were derived

Measured from three approved Lovable screenshots — Home, Missions and Labs —
each 2882px wide.

**Assumption:** the screenshots are 2× device pixel ratio renders of a ~1440px
viewport, so measured pixels ÷ 2 = CSS pixels. This is inferred from the
content column measuring ~1150 CSS px, consistent with UI/UX §10's stated
1200–1280px maximum. **If the screenshots are 1× or 3×, every size below scales
proportionally and the whole scale must be revisited.**

Sizes were derived from line spacing (reliable) and cap/x-height against known
font metrics (less reliable), then rounded to sensible steps.

---

## The scale

| Token            | Size | Face     | Weight | Confidence |
| ---------------- | ---- | -------- | ------ | ---------- |
| `--text-display` | 48px | Fraunces | 400    | **Low**    |
| `--text-h1`      | 40px | Fraunces | 400    | Medium     |
| `--text-h2`      | 30px | Fraunces | 400    | **High**   |
| `--text-h3`      | 22px | Fraunces | 400    | High       |
| `--text-body-lg` | 20px | Karla    | 400    | Medium     |
| `--text-body`    | 18px | Karla    | 400    | **High**   |
| `--text-small`   | 15px | Karla    | 400    | High       |
| `--text-label`   | 14px | Karla    | 500    | Medium     |
| `--text-eyebrow` | 12px | Karla    | 500    | **Low**    |

Line height: **1.6** for body (measured), **1.15** for headings.

---

## Observed hierarchy

### Headings — Fraunces, regular weight

The single most important finding: **headings are not bold.** "Wellbeing Lab",
"Mars Bridge Builder", "Different kinds of practice." and "Explore missions"
all render at regular weight. The editorial presence comes from Fraunces'
own character, not from weight.

`globals.css` previously set headings to 500 and now sets 400 to match.

### Editorial statements — Fraunces, semibold, ~20–22px

A distinct role the current component set does not yet have. Short declarative
lines sitting between a title and body copy:

> **A crater blocks the way.**
> **Six names appear on a list, but what the list means is not clear.**

Noticeably heavier than headings despite being smaller. Also used for pull
quotes on the Labs page, there with an olive left rule and at regular weight:

> **Can I manage myself well enough to keep going?**

### Body — Karla, 18px, line-height 1.6, muted

Consistently set in a muted warm grey rather than full charcoal, at a
comfortable measure of roughly 60–70 characters.

### Metadata — Karla, 15px, muted

The mission metadata line pairs a Lab icon with dot-separated values:

> ⌁ Challenge Lab · Ages 7–11 · 60–90 mins · Physical

On mission cards the same information appears again below a divider, separated
by wider gaps rather than dots.

### Labels and navigation — Karla, 14px, medium

Navigation, buttons and links. Links are olive with a visible underline —
"See Mission →", "Explore the 5 Labs →" — each with a trailing arrow.

### Eyebrows — Karla, ~12px, uppercase, letterspaced

"TRY WLA" above "Free Mission"; footer group headings "MISSIONS", "EXPLORE",
"FAMILIES", "TRUST & LEGAL", "FOLLOW AND CONNECT".

### Three-word rhythm

A recurring device worth preserving: a short triad in Karla semibold beneath a
heading or body block.

> Build. Test. Improve. · Choose. Weigh. Reflect. · Notice. Reset. Continue. ·
> Plan. Adjust. Connect.

---

## What the screenshots could NOT establish

Flagged rather than invented, per instruction.

1. **Exact CSS pixel values.** Everything above is measured from a raster image
   at an assumed 2× DPR. The _relationships_ are sound; the absolute numbers
   are estimates within roughly ±2px.

2. **Fraunces axis settings.** Fraunces is variable with `opsz`, `SOFT` and
   `WONK` axes as well as weight. The rendering suggests a moderate optical
   size and possibly a softened setting, but axis values cannot be read from a
   screenshot. **Default axis values are currently used.** If the approved
   design sets them, the letterforms will not match exactly.

3. **Exact weights.** "Regular" and "semibold" are visual judgements. 400 and
   600 are the most probable, but 350/500 or 500/700 would look similar at
   these sizes.

4. **Letter-spacing.** Eyebrow tracking is visible but not measurable; 0.08em
   is an estimate. Heading tracking — Fraunces often benefits from slightly
   negative tracking at display sizes — could not be determined at all.

5. **Responsive behaviour.** All three screenshots are desktop. **Nothing is
   known about type sizes at tablet or mobile**, which UI/UX §57–§61 requires
   be deliberately designed rather than scaled down. This is the largest gap.

6. **The hero.** The Home hero could not be isolated at native resolution — the
   available `sips` build ignores crop offsets, so only centre crops were
   possible on an 11,246px-tall image. `--text-display` is inferred from the
   scaled full-page view and is the least reliable value here.

7. **Colour values.** Not sampled from the screenshots. The palette is already
   locked by the Designer Brief, so tokens keep the approved hexes. One
   observation worth checking: the sage section band appears greener and
   lighter than the derived `--color-surface-sage`, which was never specified
   by any document.

---

## How to close these gaps

The screenshots settled the faces, the roles and the hierarchy — which was the
question. The remaining items need either the Lovable CSS export
(`font-variation-settings`, `letter-spacing`, breakpoint sizes) or mobile and
tablet screenshots.

None of it blocks development. The scale is coherent and implementable now.

# WLA design language — measured from the public site

**Source:** ten screen captures of the public Within Lab Academy site
(`id-preview--2d61edde-…lovable.app`), taken 2026-09-27, plus the supplied Six
Names mission image.

**Method.** The captures are 3024 × 1964 device pixels — a 14" display at 2×,
so a **1512 × 982 CSS viewport**. They were converted to lossless BMP and
sampled pixel-by-pixel rather than eyeballed. Working images are 1400 px wide,
so **1 working pixel = 1.08 CSS pixels**; every figure below is converted.

This is measurement, not inference. Where a value could not be measured it says
so, and where the measurement conflicts with a locked token it says that too.

---

## 1. Calibration — is the colour pipeline trustworthy?

The primary CTA fill measures **`#5e6a50`**. The locked Deep Olive is
`#5f6a4f`. That is a one-value-in-255 agreement on all three channels, through
HEIC capture, colour-profile conversion and JPEG.

**So the sampled colours can be trusted**, and a colour that does _not_ match a
locked token is a real difference rather than a capture artefact.

## 2. Colour

| Role                        | Measured              | Current Academy token           | Verdict                 |
| --------------------------- | --------------------- | ------------------------------- | ----------------------- |
| Primary / CTA fill          | `#5e6a50`             | `--wla-olive: #5f6a4f`          | matches                 |
| Page canvas                 | `#f1e7d7`             | `--wla-cream: #f5efe3`          | **differs — see below** |
| Header band                 | `#f4eee3`             | —                               | canvas, lifted slightly |
| Raised card fill            | `#faf4ec`             | `--color-surface: #fbf8f2`      | slightly cool           |
| Sage section band           | `#dde3cf`             | `--color-surface-sage: #eceee2` | **much too pale**       |
| Hairline rule / card border | `#e0d9cc` – `#e2dbcb` | `--color-border: #ded2c2`       | matches                 |
| Muted text                  | ~`#6b5d55`            | `--color-text-muted: #6b5d55`   | matches                 |

Two findings matter.

**The canvas is warmer than the locked token.** The site renders its page
background at `#f1e7d7`; the locked Warm Cream is `#f5efe3`. Charcoal on the
measured canvas still measures **10.7:1**, so the change is safe for contrast —
but `--wla-cream` is LOCKED by the Designer Brief and is not mine to move.
Flagged, not changed.

**The sage band is far too pale in the Academy.** `#dde3cf` is roughly a 35%
sage tint; the Academy's `#eceee2` is about 18% and reads as dirty grey rather
than sage. On the site the band is unmistakably a _different surface_. This is
a derived token, so it can be corrected.

Accent use: Fraunces _italic_ lines — the hero subhead and the closing
"The experiment starts within." — are set in **olive** (`#505d46`, `#525f45`),
not charcoal. Italic serif in olive is a distinct editorial voice on the site
and has no equivalent in the Academy.

## 3. Type

Sizes are derived from measured cap heights (Fraunces cap ≈ 0.70 em, Karla ≈
0.73 em).

| Element              | Face          | Cap height | Size               | Line height      |
| -------------------- | ------------- | ---------- | ------------------ | ---------------- |
| Hero display         | Fraunces      | 42.1 px    | **60 px**          | **1.08** (65 px) |
| Section heading      | Fraunces      | 25.9 px    | **37 px**          | ~1.15            |
| Card / FAQ title     | Fraunces      | 15.1 px    | **22 px**          | ~1.3             |
| Body                 | Karla         | 13.0 px    | **18 px**          | **1.62** (29 px) |
| Nav, small meta      | Karla         | 10.8 px    | **15 px**          | ~1.4             |
| Footer group heading | Fraunces caps | 8.6 px     | **12 px**, tracked | —                |

Body paragraphs are separated by **20 px**, not by line height alone.

Against the current Academy scale (46 / 38 / 30 / 24 / 22 / 18 / 15 / 14): body
at 18 px and small at 15 px are correct. The **display size is far too small —
46 px against a measured 60 px** — and the hero line height of 1.08 is much
tighter than the Academy's 1.15. The site's display type is the loudest thing
on the page; the Academy's is merely large.

## 4. Shape

Corner radii were measured by scanning the first filled pixel per row down from
each top-left corner.

| Element        | Measured radius                             | Current token               |
| -------------- | ------------------------------------------- | --------------------------- |
| Buttons        | half of height — **full pill** (48 px tall) | `--radius-button: 999px` ✅ |
| Cards          | **5–6 px**                                  | `--radius-card: 14px` ✗     |
| Mission images | **5–6 px**                                  | —                           |

The site is **much squarer than the Academy**. The Phase 2 move to 10 / 14 / 16
/ 18 went the wrong way: it was judged against the screenshots rather than
measured from them, and the judgement was wrong. One surface radius of **6 px**
covers cards, images, inputs and panels; only buttons are pills.

Cards carry **no shadow** — a hairline border and a lighter fill, nothing more.

## 5. Layout

| Measure                      | Value                                       |
| ---------------------------- | ------------------------------------------- |
| Content container            | **1152 px** (measured 1157)                 |
| Grid                         | **12 columns, 32 px gutter**                |
| Section split                | heading **cols 1–5**, content **cols 6–12** |
| Section padding (vertical)   | **96 px**                                   |
| Two-up grid (mission images) | 561 px + 32 px gap                          |
| Three-up grid (cards)        | 362 px + 32 px gap                          |

The 12-column arithmetic confirms itself: 7 columns of a 1152 px / 32 px grid
is 659 px, and the measured body column is 657 px.

**The asymmetric split is the site's governing layout idea.** Nearly every
section is a Fraunces heading parked in the left five columns, with all content
— prose, bullets, FAQ rows, lists — in the right seven. The left column is
mostly empty, and that emptiness is the design. The Academy currently stacks a
heading above full-width content on every screen.

The Academy's `--content-max` is **1280 px**, 128 px wider than the site.

## 6. Components

**Sections are bands, not cards.** Structure comes from full-bleed background
changes (cream → sage → cream), hairline rules and the column split. The site
puts content in a bordered box only once, in the closing three-up.

**Mission card** (the two-up on the home page):

1. Photograph, ~16:11, 6 px radius
2. Title — Fraunces 22 px
3. Meta row — a **line-art Lab icon**, then
   `Challenge Lab · Ages 7–11 · 60–90 mins · Physical`, Karla 15 px muted
4. Hook line — **Fraunces**, charcoal, e.g. "A crater blocks the way."
5. Description — Karla, muted, two lines

No border, no fill, no padding box, no shadow. The photograph _is_ the card.

**The five Labs have line-art icons** — dividers (Challenge), scales
(Decision), an eye (Curiosity), a sprout (Wellbeing), a compass (Navigation).
Thin stroke, charcoal, ~20 px. They appear in the mission meta row and in a
Labs rail set between two full-width hairlines. **The Academy has no icon
assets and none exist in the repository.**

**Lists are rules, not boxes.** The FAQ is hairline-separated rows with a
Fraunces question and a right-aligned chevron.

**Two action treatments, used consistently:**

- Primary — olive pill, arrow in the text: `Try a Free Mission →`
- Everything else — an underlined text link, also with the arrow:
  `Explore the 5 Labs →`

The primary CTA, measured from the hero at full resolution:

| Property               | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| Height                 | **48 px**                                               |
| Width (for that label) | 201.5 px                                                |
| Corner radius          | half the height — a **true pill**                       |
| Horizontal padding     | **28 px**                                               |
| Fill                   | **`#5F6A4F`** (client-supplied; sampled `#5f6a4f`)      |
| Fill on hover          | **`#49523B`** (client-supplied)                         |
| Label                  | **`#F4F0E6`** (client-supplied), Karla 500 at **16 px** |

The label size was derived from text **width**, not cap height: Karla at 500
sets "Try a Free Mission" in 131.8 px and the site's button measures 132.5 px,
a 0.5% match. At 18 px it is 148 px — 12% too wide, which is what made the
Academy's button read as a different control. 16 px is the one step that is not
on the type scale above, and it exists only for this.

Contrast on the button: **5.04:1** at rest, **7.23:1** on hover.

There is no outline-button variant anywhere in the page body; the only bordered
control is `My Missions` in the header. The Academy's `secondary` variant —
filled surface plus a strong border — has no counterpart on the site.

**Middle dots are brand vocabulary.** `Self-paced · Screen-light · Ages 7–15`
appears in the hero and in every mission meta row, with air around each dot.
The `--space-meta` token added in Phase 2 is correct.

## 7. What the captures could not establish

- Mobile and tablet behaviour — every capture is a 1512 px viewport.
- Hover, focus and active states.
- Fraunces axis settings (`SOFT`, `WONK`, optical size).
- Exact stroke weight and grid of the Lab icons; they are described here from
  appearance at ~20 px, which is not enough to redraw them faithfully.

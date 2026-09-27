import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import "./globals.css";

/*
 * APPROVED WLA TYPEFACES (D-33, client-confirmed 2026-09-26).
 *
 *   Fraunces — display and headings
 *   Karla    — body, interface, labels, navigation, buttons
 *
 * Both are variable fonts, loaded across their full weight range so the
 * observed hierarchy (regular headings, semibold editorial statements,
 * medium labels) is available without extra network requests.
 *
 * Do not substitute. See docs/TYPOGRAPHY.md for what was measured from the
 * approved design and what remains unconfirmed.
 */
const serif = Fraunces({
  variable: "--font-wla-serif",
  subsets: ["latin"],
  display: "swap",
});

const sans = Karla({
  variable: "--font-wla-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Within Lab Academy",
    template: "%s · Within Lab Academy",
  },
  description: "Self-paced, screen-light missions for children aged 7–15.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
     * The font variables go on <html>, NOT <body>.
     *
     * tokens.css declares `--font-serif: var(--font-wla-serif), …` on :root,
     * which IS <html>. With the variable classes on <body> — a child — that
     * reference was unresolved at the point of substitution, so --font-serif
     * computed to the guaranteed-invalid value and inherited as invalid to
     * every descendant. The result: no heading in this application ever
     * rendered in Fraunces; they all fell back through to the sans stack.
     *
     * It was invisible to every check we had. The classes were on the element,
     * the @font-face rules were in the compiled CSS, and the font files served
     * 200 — all true, and all beside the point. It took a rendered screenshot
     * to see it.
     */
    <html lang="en-GB" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}

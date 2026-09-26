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
    <html lang="en-GB">
      <body className={`${serif.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}

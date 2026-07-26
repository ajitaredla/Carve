import type { Metadata } from "next";
import "./globals.css";

// Task 7.0 design system — curious.pm's 4-font system
// (.scratch/curious-pm-design-tokens.md): Clash Display (section/hero
// headings), Clash Grotesk (subheadings), Inter (body/UI text), Geist Mono
// (numeric/currency figures — waterfall line items, scores).
//
// TODO(design, blocked on licensing per the tokens doc + task 7.0's note):
// Clash Display / Clash Grotesk are Fontshare faces, NOT on Google Fonts, so
// they can't be loaded via `next/font/google`. Once licensing is confirmed
// and the real `.woff2` files are added (e.g. under
// `public/fonts/clash-display/`, `public/fonts/clash-grotesk/`), swap the
// two substitutes below for `next/font/local`, keeping the SAME CSS variable
// names so no other file needs to change:
//
//   import localFont from "next/font/local";
//   const clashDisplay = localFont({
//     src: [
//       { path: "../public/fonts/clash-display/ClashDisplay-Semibold.woff2", weight: "600" },
//       { path: "../public/fonts/clash-display/ClashDisplay-Bold.woff2", weight: "700" },
//     ],
//     variable: "--font-clash-display",
//   });
//   // ...and the equivalent for --font-clash-grotesk.
//
// The production build must be self-contained: `next/font/google` downloads
// assets while building, which makes a release depend on Google Fonts being
// reachable from the builder. CSS system fallbacks keep the intended role
// distinctions until licensed local font files are added.

export const metadata: Metadata = {
  title: "Carve",
  description: "AI retail-readiness platform for CPG brands",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

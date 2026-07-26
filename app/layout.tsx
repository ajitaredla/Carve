import type { Metadata } from "next";
import { Archivo, Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Task 7.0 design system — curious.pm's 4-font system
// (.scratch/curious-pm-design-tokens.md): Clash Display (section/hero
// headings), Clash Grotesk (subheadings), Inter (body/UI text), Geist Mono
// (numeric/currency figures — waterfall line items, scores).
//
// Inter and Geist Mono are real Google Fonts, loaded normally below.
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
// Until then, Archivo (display) and Space Grotesk (subheadings) are the
// closest bold-geometric-sans substitutes available on Google Fonts — both
// are, like Clash, grotesque-leaning geometric sans-serifs with strong
// display weights, not an unrelated stand-in.
const clashDisplay = Archivo({
  variable: "--font-clash-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const clashGrotesk = Space_Grotesk({
  variable: "--font-clash-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${clashDisplay.variable} ${clashGrotesk.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

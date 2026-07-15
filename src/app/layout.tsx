import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Mindscape AMA Search",
  description: "Search 8 years of Sean Carroll's Mindscape Ask Me Anything answers."
};

// Dark is the canonical theme (DESIGN.md §1): default to it unless the user has
// chosen light, explicitly or via OS preference. Runs before paint to avoid a
// flash of the wrong theme.
const themeScript = `(() => { try { const v = localStorage.getItem('theme'); const d = v ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); document.documentElement.dataset.theme = d; } catch { document.documentElement.dataset.theme = 'dark'; } })()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

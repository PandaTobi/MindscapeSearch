import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Sean Carroll",
    "Mindscape",
    "AMA",
    "Ask Me Anything",
    "physics",
    "philosophy",
    "podcast transcript search",
    "semantic search"
  ],
  authors: [{ name: "Mindscape AMA Search" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US"
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION
  },
  robots: {
    index: true,
    follow: true
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" }
  ],
  colorScheme: "dark light"
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
      <body>
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:border focus-visible:border-border focus-visible:bg-bg-raised focus-visible:px-3 focus-visible:py-2 focus-visible:text-caption focus-visible:text-text-primary"
        >
          Skip to search
        </a>
        {children}
        <noscript>
          <div
            style={{ padding: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}
          >
            <h1>{SITE_NAME}</h1>
            <p>{SITE_DESCRIPTION}</p>
            <p>This search runs entirely in your browser and requires JavaScript to be enabled.</p>
          </div>
        </noscript>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mindscape AMA Search",
  description: "Search Sean Carroll's Mindscape Ask Me Anything transcripts."
};

const themeScript = `(() => { try { const v = localStorage.getItem('theme'); const d = v ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); document.documentElement.dataset.theme = d; } catch {} })()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

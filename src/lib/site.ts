/** Canonical site origin + base path, driven by CI env so the same build
 * works at a user/org root (`https://user.github.io`) or a project subpath
 * (`https://user.github.io/mindscape-search`). Both are optional locally. */
const rawOrigin =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://example.github.io";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "";

export const SITE_ORIGIN = rawOrigin;
export const BASE_PATH = basePath;

/** Absolute URL of the deployed app root, e.g. used for canonical + sitemap. */
export const SITE_URL = `${rawOrigin}${basePath}` || rawOrigin;

export const SITE_NAME = "Mindscape AMA Search";
export const SITE_DESCRIPTION =
  "Search 8 years of Sean Carroll's Mindscape Ask Me Anything answers — instant keyword, hybrid, and semantic search with deep links to the exact timestamp.";

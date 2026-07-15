import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Emitted as a static /sitemap.xml at export time. There is a single real
// route — all search state lives in query params on it — so the sitemap lists
// just that one canonical URL.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "monthly",
      priority: 1
    }
  ];
}

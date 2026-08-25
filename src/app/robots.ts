import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/** Request-time evaluation so Vercel Preview never freezes a localhost sitemap URL. */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/verein", "/auth"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

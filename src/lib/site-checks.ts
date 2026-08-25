import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PRODUCTION_SITE_URL,
  getContentSecurityPolicyHeaderValue,
  getSiteUrl,
  MEIN_TURNIERPLAN_FRAME_SRC_HOSTS,
} from "@/lib/site";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runSiteUrlAndCspChecks() {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;

  try {
    // A) explicit production URL
    process.env.NEXT_PUBLIC_SITE_URL = DEFAULT_PRODUCTION_SITE_URL;
    assert(getSiteUrl() === DEFAULT_PRODUCTION_SITE_URL, "A: explicit SITE_URL");

    process.env.NEXT_PUBLIC_SITE_URL = `${DEFAULT_PRODUCTION_SITE_URL}/`;
    assert(getSiteUrl() === DEFAULT_PRODUCTION_SITE_URL, "A: trailing slash stripped");

    // B) without env => localhost
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "vf-l-tournament-cy1dkrg01-briefscan-s-projects.vercel.app";
    assert(getSiteUrl() === "http://localhost:3000", "B: no VERCEL_URL fallback");
    delete process.env.VERCEL_URL;

    // C/D/E source inspection: sitemap/robots use getSiteUrl and include /live
    const sitemapSource = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
    assert(sitemapSource.includes("getSiteUrl"), "C: sitemap uses getSiteUrl");
    assert(sitemapSource.includes('"/live"'), "E: /live in sitemap");
    assert(!sitemapSource.includes("VERCEL_URL"), "C: sitemap ignores VERCEL_URL");

    const robotsSource = readFileSync(join(process.cwd(), "src/app/robots.ts"), "utf8");
    assert(robotsSource.includes("getSiteUrl"), "D: robots uses getSiteUrl");
    assert(robotsSource.includes("/sitemap.xml"), "D: robots sitemap path");
    assert(robotsSource.includes('"/admin"'), "D: disallow admin");
    assert(robotsSource.includes('"/verein"'), "D: disallow verein");
    assert(robotsSource.includes('"/auth"'), "D: disallow auth");

    const siteSource = readFileSync(join(process.cwd(), "src/lib/site.ts"), "utf8");
    assert(siteSource.includes("NEXT_PUBLIC_SITE_URL"), "site helper reads SITE_URL");
    assert(
      !/process\.env\.VERCEL_URL/.test(siteSource),
      "site helper must not use VERCEL_URL",
    );

    const layoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    assert(layoutSource.includes("metadataBase"), "layout sets metadataBase");
    assert(layoutSource.includes("getSiteUrl"), "layout uses getSiteUrl");

    // F/G CSP header value
    const csp = getContentSecurityPolicyHeaderValue();
    assert(csp.includes("frame-src"), "F: CSP has frame-src");
    assert(csp.includes("'self'"), "G: self allowed");
    for (const host of MEIN_TURNIERPLAN_FRAME_SRC_HOSTS) {
      assert(csp.includes(host), `G: ${host} allowed`);
    }
    assert(!csp.includes("frame-src *"), "G: no wildcard frame-src");
    assert(!csp.includes("https://*"), "G: no broad https wildcard");

    const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    assert(nextConfig.includes("Content-Security-Policy"), "F: next config sets CSP");
    assert(nextConfig.includes("/:path*") || nextConfig.includes("/(.*)"), "F: headers cover routes");
    assert(nextConfig.includes("getContentSecurityPolicyHeaderValue"), "F: shared CSP helper");

    // H) real MTP widget fixture still allowlisted
    assert(
      MEIN_TURNIERPLAN_FRAME_SRC_HOSTS.includes("https://www.meinturnierplan.de"),
      "H: www.meinturnierplan.de allowlisted",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  }

  return "ok";
}

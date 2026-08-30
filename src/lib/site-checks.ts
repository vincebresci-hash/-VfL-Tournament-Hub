import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PRODUCTION_SITE_URL,
  getContentSecurityPolicyHeaderValue,
  getEmailSiteUrl,
  getInviteRedirectSiteUrl,
  getSiteUrl,
  isEphemeralVercelHost,
  MEIN_TURNIERPLAN_FRAME_SRC_HOSTS,
} from "@/lib/site";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runSiteUrlAndCspChecks() {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const previousVercel = process.env.VERCEL;
  const previousVercelUrl = process.env.VERCEL_URL;

  try {
    // A) NEXT_PUBLIC_SITE_URL gesetzt => Env verwenden
    delete process.env.VERCEL;
    process.env.NEXT_PUBLIC_SITE_URL = DEFAULT_PRODUCTION_SITE_URL;
    assert(getSiteUrl() === DEFAULT_PRODUCTION_SITE_URL, "A: explicit SITE_URL");

    process.env.NEXT_PUBLIC_SITE_URL = `${DEFAULT_PRODUCTION_SITE_URL}/`;
    assert(getSiteUrl() === DEFAULT_PRODUCTION_SITE_URL, "A: trailing slash stripped");

    // Env hat Vorrang auch auf Vercel
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_SITE_URL = "https://example-custom.example";
    assert(getSiteUrl() === "https://example-custom.example", "A: env wins over Vercel fallback");

    // B) Env fehlt + VERCEL=1 => Production-Domain (nie VERCEL_URL)
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL = "1";
    process.env.VERCEL_URL = "vf-l-tournament-cy1dkrg01-briefscan-s-projects.vercel.app";
    assert(getSiteUrl() === DEFAULT_PRODUCTION_SITE_URL, "B: Vercel fallback to production");
    assert(
      getSiteUrl() !== `https://${process.env.VERCEL_URL}`,
      "B: no VERCEL_URL as canonical",
    );

    // C) Env fehlt + kein VERCEL => localhost
    delete process.env.VERCEL;
    delete process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert(getSiteUrl() === "http://localhost:3000", "C: local fallback");

    // Invite redirects must never use ephemeral Vercel preview hosts.
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_SITE_URL =
      "https://vf-l-tournament-hub-cy1dkrg01-briefscan-s-projects.vercel.app";
    assert(
      getInviteRedirectSiteUrl() === DEFAULT_PRODUCTION_SITE_URL,
      "invite redirect rejects ephemeral vercel preview host",
    );
    process.env.NEXT_PUBLIC_SITE_URL = "https://vf-l-tournament-hub-blim.vercel.app";
    assert(
      getInviteRedirectSiteUrl() === DEFAULT_PRODUCTION_SITE_URL,
      "invite redirect rejects branch preview host blim",
    );
    assert(
      getEmailSiteUrl() === DEFAULT_PRODUCTION_SITE_URL,
      "email site url rejects preview host on vercel",
    );
    assert(
      isEphemeralVercelHost("vf-l-tournament-hub-cy1dkrg01-briefscan-s-projects.vercel.app"),
      "preview host detection",
    );
    assert(
      !isEphemeralVercelHost(new URL(DEFAULT_PRODUCTION_SITE_URL).hostname),
      "canonical production host is not ephemeral",
    );
    process.env.NEXT_PUBLIC_SITE_URL = DEFAULT_PRODUCTION_SITE_URL;
    assert(
      getInviteRedirectSiteUrl() === DEFAULT_PRODUCTION_SITE_URL,
      "invite redirect accepts canonical NEXT_PUBLIC_SITE_URL",
    );

    // Source inspection: sitemap/robots/layout use getSiteUrl only
    const sitemapSource = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
    assert(sitemapSource.includes("getSiteUrl"), "D: sitemap uses getSiteUrl");
    assert(sitemapSource.includes('"/live"'), "D: /live in sitemap");
    assert(sitemapSource.includes('"/partner"'), "D: /partner in sitemap");
    assert(sitemapSource.includes('"/news"'), "D: /news in sitemap");
    assert(!sitemapSource.includes("VERCEL_URL"), "D: sitemap ignores VERCEL_URL");
    assert(!sitemapSource.includes("localhost:3000"), "D: sitemap has no hardcoded localhost");

    const robotsSource = readFileSync(join(process.cwd(), "src/app/robots.ts"), "utf8");
    assert(robotsSource.includes("getSiteUrl"), "D: robots uses getSiteUrl");
    assert(robotsSource.includes("force-dynamic"), "D: robots is dynamic");
    assert(robotsSource.includes("/sitemap.xml"), "D: robots sitemap path");
    assert(robotsSource.includes('"/admin"'), "D: disallow admin");
    assert(robotsSource.includes('"/verein"'), "D: disallow verein");
    assert(robotsSource.includes('"/auth"'), "D: disallow auth");
    assert(!robotsSource.includes("VERCEL_URL"), "D: robots ignores VERCEL_URL");
    assert(!robotsSource.includes("localhost:3000"), "D: robots has no hardcoded localhost");

    const siteSource = readFileSync(join(process.cwd(), "src/lib/site.ts"), "utf8");
    assert(siteSource.includes("NEXT_PUBLIC_SITE_URL"), "site helper reads SITE_URL");
    assert(siteSource.includes('process.env.VERCEL === "1"'), "site helper checks VERCEL");
    assert(siteSource.includes("getInviteRedirectSiteUrl"), "site helper exports invite redirect url");
    assert(siteSource.includes("getEmailSiteUrl"), "site helper exports email site url");
    assert(siteSource.includes("isEphemeralVercelHost"), "site helper detects preview hosts");
    assert(siteSource.includes("withCanonical"), "site helper exports withCanonical");
    assert(siteSource.includes("canonicalPath"), "site helper exports canonicalPath");
    assert(
      !/process\.env\.VERCEL_URL/.test(siteSource),
      "site helper must not use VERCEL_URL",
    );

    const layoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    assert(layoutSource.includes("metadataBase"), "layout sets metadataBase");
    assert(layoutSource.includes("getSiteUrl"), "layout uses getSiteUrl");
    assert(!layoutSource.includes("VERCEL_URL"), "layout ignores VERCEL_URL");
    assert(!layoutSource.includes("localhost:3000"), "layout has no hardcoded localhost");
    assert(
      !/alternates:\s*\{\s*canonical:\s*"\/"/.test(layoutSource),
      "layout must not force global canonical /",
    );
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
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }

    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }

    if (previousVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = previousVercelUrl;
    }
  }

  return "ok";
}

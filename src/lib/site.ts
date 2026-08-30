import type { Metadata } from "next";

/**
 * Public canonical site origin.
 * Prefer NEXT_PUBLIC_SITE_URL in every deployed environment.
 * Never use VERCEL_URL / preview hosts as the canonical production URL.
 * On Vercel without SITE_URL, fall back to the stable production domain
 * so Preview never emits localhost or ephemeral deployment hosts.
 */
export const DEFAULT_PRODUCTION_SITE_URL = "https://vf-l-tournament-hub.vercel.app";

export const CANONICAL_PRODUCTION_HOST = new URL(DEFAULT_PRODUCTION_SITE_URL).hostname;

/** Ephemeral Vercel preview deployments must never be baked into auth invite emails. */
export function isEphemeralVercelHost(hostname: string) {
  return hostname.endsWith(".vercel.app") && hostname !== CANONICAL_PRODUCTION_HOST;
}

function isLocalDevHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Stable origin for Supabase Auth invite / resend redirectTo.
 *
 * On any Vercel runtime (Production or Preview), invites always use the canonical
 * production host. Preview/branch hosts such as vf-l-tournament-hub-blim.vercel.app
 * must never be passed to inviteUserByEmail, even when NEXT_PUBLIC_SITE_URL points
 * at them.
 */
export function getInviteRedirectSiteUrl() {
  if (process.env.VERCEL === "1") {
    return DEFAULT_PRODUCTION_SITE_URL;
  }

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    try {
      const hostname = new URL(explicit).hostname;
      if (hostname === CANONICAL_PRODUCTION_HOST || isLocalDevHost(hostname)) {
        return explicit;
      }
    } catch {
      // Invalid URL — fall through to local fallback below.
    }
  }

  return explicit ?? "http://localhost:3000";
}

export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }

  if (process.env.VERCEL === "1") {
    return DEFAULT_PRODUCTION_SITE_URL;
  }

  return "http://localhost:3000";
}

/**
 * Stable origin for transactional email links (participation, CTAs).
 * On Vercel always uses the canonical production host so preview/blim URLs
 * never leak into Resend payloads after PR35 URL validation.
 */
export function getEmailSiteUrl() {
  if (process.env.VERCEL === "1") {
    return DEFAULT_PRODUCTION_SITE_URL;
  }

  return getSiteUrl();
}

/**
 * Pathname for Metadata `alternates.canonical` (resolved via metadataBase).
 * Pass "/" for the homepage or a rooted path like "/turniere".
 */
export function canonicalPath(pathname: string) {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

/** Merge a self-referencing canonical into page metadata. */
export function withCanonical(pathname: string, metadata: Metadata = {}): Metadata {
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      canonical: canonicalPath(pathname),
    },
  };
}

export const MEIN_TURNIERPLAN_FRAME_SRC_HOSTS = [
  "https://www.meinturnierplan.de",
  "https://meinturnierplan.de",
] as const;

export function getContentSecurityPolicyHeaderValue() {
  return `frame-src 'self' ${MEIN_TURNIERPLAN_FRAME_SRC_HOSTS.join(" ")};`;
}

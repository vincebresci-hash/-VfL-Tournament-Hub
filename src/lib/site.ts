import type { Metadata } from "next";

/**
 * Public canonical site origin.
 * Prefer NEXT_PUBLIC_SITE_URL in every deployed environment.
 * Never use VERCEL_URL / preview hosts as the canonical production URL.
 * On Vercel without SITE_URL, fall back to the stable production domain
 * so Preview never emits localhost or ephemeral deployment hosts.
 */
export const DEFAULT_PRODUCTION_SITE_URL = "https://vf-l-tournament-hub.vercel.app";

const CANONICAL_PRODUCTION_HOST = new URL(DEFAULT_PRODUCTION_SITE_URL).hostname;

/** Ephemeral Vercel preview deployments must never be baked into auth invite emails. */
export function isEphemeralVercelHost(hostname: string) {
  return hostname.endsWith(".vercel.app") && hostname !== CANONICAL_PRODUCTION_HOST;
}

/**
 * Stable origin for Supabase Auth invite / resend redirectTo.
 * Never uses VERCEL_URL. Rejects ephemeral *.vercel.app preview hosts even when
 * NEXT_PUBLIC_SITE_URL points at a preview deployment.
 */
export function getInviteRedirectSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

  if (explicit) {
    try {
      const hostname = new URL(explicit).hostname;
      if (!isEphemeralVercelHost(hostname)) {
        return explicit;
      }
    } catch {
      // Invalid URL — fall through to stable defaults below.
    }
  }

  if (process.env.VERCEL === "1") {
    return DEFAULT_PRODUCTION_SITE_URL;
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

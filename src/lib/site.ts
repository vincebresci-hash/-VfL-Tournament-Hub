import type { Metadata } from "next";

/**
 * Public canonical site origin.
 * Prefer NEXT_PUBLIC_SITE_URL in every deployed environment.
 * Never use VERCEL_URL / preview hosts as the canonical production URL.
 * On Vercel without SITE_URL, fall back to the stable production domain
 * so Preview never emits localhost or ephemeral deployment hosts.
 */
export const DEFAULT_PRODUCTION_SITE_URL = "https://vf-l-tournament-hub.vercel.app";

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

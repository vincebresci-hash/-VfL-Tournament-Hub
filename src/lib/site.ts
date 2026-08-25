/**
 * Public canonical site origin.
 * Prefer NEXT_PUBLIC_SITE_URL in every deployed environment.
 * Never use VERCEL_URL / preview hosts as the canonical production URL.
 */
export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }

  return "http://localhost:3000";
}

export const DEFAULT_PRODUCTION_SITE_URL = "https://vf-l-tournament-hub.vercel.app";

export const MEIN_TURNIERPLAN_FRAME_SRC_HOSTS = [
  "https://www.meinturnierplan.de",
  "https://meinturnierplan.de",
] as const;

export function getContentSecurityPolicyHeaderValue() {
  return `frame-src 'self' ${MEIN_TURNIERPLAN_FRAME_SRC_HOSTS.join(" ")};`;
}

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

export const MEIN_TURNIERPLAN_FRAME_SRC_HOSTS = [
  "https://www.meinturnierplan.de",
  "https://meinturnierplan.de",
] as const;

export function getContentSecurityPolicyHeaderValue() {
  return `frame-src 'self' ${MEIN_TURNIERPLAN_FRAME_SRC_HOSTS.join(" ")};`;
}

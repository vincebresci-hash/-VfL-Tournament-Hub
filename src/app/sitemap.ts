import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { listPublicTournaments } from "@/lib/db/tournament-queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const staticRoutes = [
    "",
    "/turniere",
    "/fuer-vereine",
    "/ueber-uns",
    "/anlage",
    "/faq",
    "/kontakt",
    "/impressum",
    "/datenschutz",
    "/nutzungsbedingungen",
  ];

  const entries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: `${base}${path || "/"}`,
    changeFrequency: path === "/turniere" || path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/turniere" ? 0.9 : 0.6,
  }));

  try {
    const tournaments = await listPublicTournaments();
    for (const tournament of tournaments) {
      entries.push({
        url: `${base}/turniere/${tournament.slug}`,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch {
    // Sitemap bleibt ohne Turniere nutzbar, falls die Datenbank nicht erreichbar ist.
  }

  return entries;
}

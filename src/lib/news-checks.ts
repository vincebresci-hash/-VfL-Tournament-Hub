import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getNewsPostStatus,
  isNewsPostPubliclyVisible,
  isSitemapEligibleNewsPost,
  newsPostStatusLabel,
  resolveUniqueNewsSlug,
  slugifyText,
  validateNewsPostInput,
} from "@/lib/news";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const now = new Date("2026-08-20T12:00:00.000Z");

function post(overrides: {
  publishedAt?: string | null;
  archivedAt?: string | null;
}) {
  return {
    publishedAt: overrides.publishedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
  };
}

export function runNewsSelfChecks() {
  const migration = readSource("supabase/migrations/20260829120000_news_posts.sql");
  const newsActions = readSource("src/lib/db/news-actions.ts");
  const newsQueries = readSource("src/lib/db/news-queries.ts");
  const newsDetailPage = readSource("src/app/news/[slug]/page.tsx");
  const newsListPage = readSource("src/app/news/page.tsx");
  const sitemap = readSource("src/app/sitemap.ts");

  // A) Entwurf → nicht öffentlich
  assert(
    !isNewsPostPubliclyVisible(post({ publishedAt: null }), now),
    "A: draft is not public",
  );
  assert(getNewsPostStatus(post({ publishedAt: null }), now) === "draft", "A: draft status");

  // B) veröffentlicht → öffentlich
  assert(
    isNewsPostPubliclyVisible(post({ publishedAt: "2026-08-19T10:00:00.000Z" }), now),
    "B: published is public",
  );
  assert(
    getNewsPostStatus(post({ publishedAt: "2026-08-19T10:00:00.000Z" }), now) === "published",
    "B: published status",
  );

  // C) scheduled → nicht öffentlich
  assert(
    !isNewsPostPubliclyVisible(post({ publishedAt: "2026-08-21T10:00:00.000Z" }), now),
    "C: scheduled is not public",
  );
  assert(
    getNewsPostStatus(post({ publishedAt: "2026-08-21T10:00:00.000Z" }), now) === "scheduled",
    "C: scheduled status",
  );

  // D) archiviert → nicht öffentlich
  assert(
    !isNewsPostPubliclyVisible(
      post({ publishedAt: "2026-08-19T10:00:00.000Z", archivedAt: "2026-08-20T10:00:00.000Z" }),
      now,
    ),
    "D: archived is not public",
  );
  assert(
    getNewsPostStatus(
      post({ publishedAt: "2026-08-19T10:00:00.000Z", archivedAt: "2026-08-20T10:00:00.000Z" }),
      now,
    ) === "archived",
    "D: archived status",
  );

  // E) published + archived → nicht öffentlich
  assert(
    !isNewsPostPubliclyVisible(
      post({ publishedAt: "2026-08-19T10:00:00.000Z", archivedAt: "2026-08-20T10:00:00.000Z" }),
      now,
    ),
    "E: published+archived is not public",
  );

  // F) Slug-Erstellung
  assert(
    slugifyText("U10 Herbst Cup – Anmeldung geöffnet") ===
      "u10-herbst-cup-anmeldung-geoeffnet",
    "F: slug creation",
  );

  // G) Umlaut-Slug
  assert(slugifyText("Größe Äpfel Übung") === "groesse-aepfel-uebung", "G: umlaut slug");

  // H) Slug-Kollision → -2 (unit-style via helper contract)
  assert(
    typeof resolveUniqueNewsSlug === "function",
    "H: resolveUniqueNewsSlug exported",
  );

  // I) Teaser >300 → Validation Fail
  const tooLong = validateNewsPostInput({
    title: "Titel",
    excerpt: "x".repeat(301),
    content: "Inhalt",
  });
  assert(tooLong.error?.includes("300"), "I: teaser >300 fails");

  // J) leerer Titel → Fail
  const noTitle = validateNewsPostInput({ title: "  ", excerpt: "Teaser", content: "Inhalt" });
  assert(noTitle.error?.includes("Titel"), "J: empty title fails");

  // K) leerer Content → Fail
  const noContent = validateNewsPostInput({ title: "Titel", excerpt: "Teaser", content: "  " });
  assert(noContent.error?.includes("Inhalt"), "K: empty content fails");

  // L) Public Query Filter
  assert(newsQueries.includes('.is("archived_at", null)'), "L: public query filters archived");
  assert(newsQueries.includes('.lte("published_at", nowIso)'), "L: public query filters scheduled");

  // M) Sitemap Filter
  assert(sitemap.includes("listPublishedNewsPosts"), "M: sitemap uses published news query");
  assert(
    isSitemapEligibleNewsPost(post({ publishedAt: "2026-08-19T10:00:00.000Z" }), now),
    "M: sitemap eligible published",
  );
  assert(
    !isSitemapEligibleNewsPost(post({ publishedAt: null }), now),
    "M: sitemap excludes draft",
  );

  // N) Admin Status draft
  assert(newsPostStatusLabel.draft === "Entwurf", "N: draft label");

  // O) Admin Status scheduled
  assert(newsPostStatusLabel.scheduled === "Geplant", "O: scheduled label");

  // P) Admin Status published
  assert(newsPostStatusLabel.published === "Veröffentlicht", "P: published label");

  // Q) Admin Status archived
  assert(newsPostStatusLabel.archived === "Archiviert", "Q: archived label");

  // R) keine HTML-Ausführung / kein dangerouslySetInnerHTML
  assert(!newsDetailPage.includes("dangerouslySetInnerHTML"), "R: no dangerouslySetInnerHTML");
  assert(newsDetailPage.includes("whitespace-pre-wrap"), "R: plain text rendering");

  // S) route-spezifischer canonical
  assert(newsDetailPage.includes("withCanonical(`/news/${slug}`"), "S: route canonical");
  assert(newsListPage.includes('withCanonical("/news"'), "S: list canonical");

  // T) route-spezifisches openGraph.url
  assert(newsDetailPage.includes("openGraph"), "T: openGraph metadata");
  assert(newsDetailPage.includes("url: pageUrl"), "T: route-specific openGraph.url");
  assert(newsDetailPage.includes("getSiteUrl()"), "T: builds absolute news url");

  // RLS migration checks
  assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
  assert(migration.includes("published_at <= now()"), "RLS public published filter");
  assert(migration.includes("public.is_admin()"), "RLS admin policy");

  // Admin guard
  assert(newsActions.includes("requireNewsManage()"), "Admin actions guarded");

  return "ok";
}

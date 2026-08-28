import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type { NewsPostRow } from "@/lib/supabase/database";
import type { NewsPost, NewsPostStatus, NewsPostWithTournament } from "@/types/news";

export function slugifyText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function getNewsPostStatus(
  post: Pick<NewsPost, "publishedAt" | "archivedAt">,
  now: Date = new Date(),
): NewsPostStatus {
  if (post.archivedAt) {
    return "archived";
  }

  if (!post.publishedAt) {
    return "draft";
  }

  if (new Date(post.publishedAt) > now) {
    return "scheduled";
  }

  return "published";
}

export function isNewsPostPubliclyVisible(
  post: Pick<NewsPost, "publishedAt" | "archivedAt">,
  now: Date = new Date(),
) {
  return getNewsPostStatus(post, now) === "published";
}

export const newsPostStatusLabel: Record<NewsPostStatus, string> = {
  draft: "Entwurf",
  scheduled: "Geplant",
  published: "Veröffentlicht",
  archived: "Archiviert",
};

export function toNewsPost(row: NewsPostRow): NewsPost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
    featured: row.featured,
    tournamentId: row.tournament_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function toNewsPostWithTournament(
  row: NewsPostRow & {
    tournaments?: { name: string; slug: string } | null;
  },
): NewsPostWithTournament {
  return {
    ...toNewsPost(row),
    tournamentName: row.tournaments?.name ?? null,
    tournamentSlug: row.tournaments?.slug ?? null,
  };
}

export async function resolveUniqueNewsSlug(
  supabase: SupabaseClient<Database>,
  baseSlug: string,
  excludeId?: string,
) {
  const normalized = slugifyText(baseSlug);
  if (!normalized) {
    return "news";
  }

  let candidate = normalized;
  let suffix = 2;

  while (true) {
    let query = supabase.from("news_posts").select("id").eq("slug", candidate);
    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return candidate;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${normalized}-${suffix}`;
    suffix += 1;
  }
}

export function parsePublishedAtInput(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function validateNewsPostInput(input: {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
}) {
  const title = input.title.trim();
  if (!title) {
    return { error: "Titel ist erforderlich.", value: null };
  }

  const excerpt = input.excerpt.trim();
  if (!excerpt) {
    return { error: "Teaser ist erforderlich.", value: null };
  }

  if (excerpt.length > 300) {
    return { error: "Teaser darf maximal 300 Zeichen lang sein.", value: null };
  }

  const content = input.content.trim();
  if (!content) {
    return { error: "Inhalt ist erforderlich.", value: null };
  }

  const slugInput = input.slug?.trim();
  const slug = slugInput ? slugifyText(slugInput) : slugifyText(title);
  if (!slug) {
    return { error: "Slug ist ungültig.", value: null };
  }

  return {
    error: null,
    value: {
      title,
      slug,
      excerpt,
      content,
    },
  };
}

export function isSitemapEligibleNewsPost(
  post: Pick<NewsPost, "publishedAt" | "archivedAt">,
  now: Date = new Date(),
) {
  return isNewsPostPubliclyVisible(post, now);
}

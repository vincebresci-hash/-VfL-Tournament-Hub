import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import {
  isNewsPostPubliclyVisible,
  toNewsPost,
  toNewsPostWithTournament,
} from "@/lib/news";
import type { NewsPostRow } from "@/lib/supabase/database";
import type { NewsPost, NewsPostWithTournament } from "@/types/news";

const PUBLIC_NEWS_SELECT =
  "id, title, slug, excerpt, content, image_url, published_at, featured, tournament_id, created_at, updated_at, archived_at, tournaments(name, slug)";

const ADMIN_NEWS_SELECT = `${PUBLIC_NEWS_SELECT}`;

function filterPublicPosts(rows: NewsPostRow[]) {
  return rows
    .map((row) => toNewsPostWithTournament(row))
    .filter((post) => isNewsPostPubliclyVisible(post));
}

export async function listPublishedNewsPosts(): Promise<NewsPostWithTournament[]> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("news_posts")
    .select(PUBLIC_NEWS_SELECT)
    .is("archived_at", null)
    .not("published_at", "is", null)
    .lte("published_at", nowIso)
    .order("published_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return filterPublicPosts(data as NewsPostRow[]);
}

export async function getPublishedNewsPostBySlug(
  slug: string,
): Promise<NewsPostWithTournament | null> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("news_posts")
    .select(PUBLIC_NEWS_SELECT)
    .eq("slug", slug)
    .is("archived_at", null)
    .not("published_at", "is", null)
    .lte("published_at", nowIso)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const post = toNewsPostWithTournament(data as NewsPostRow);
  return isNewsPostPubliclyVisible(post) ? post : null;
}

export async function getFeaturedNewsPosts(limit = 3): Promise<NewsPostWithTournament[]> {
  const posts = await listPublishedNewsPosts();
  return posts.filter((post) => post.featured).slice(0, limit);
}

export async function listAdminNewsPosts(): Promise<{
  posts: NewsPostWithTournament[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("news_posts")
    .select(ADMIN_NEWS_SELECT)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return { posts: [], ready: !isMissingRelationError(error) };
  }

  return {
    ready: true,
    posts: (data as NewsPostRow[]).map((row) => toNewsPostWithTournament(row)),
  };
}

export async function getAdminNewsPostById(id: string): Promise<NewsPost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("news_posts")
    .select(
      "id, title, slug, excerpt, content, image_url, published_at, featured, tournament_id, created_at, updated_at, archived_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toNewsPost(data as NewsPostRow);
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { toUserFacingDbError } from "@/lib/db/errors";
import {
  parsePublishedAtInput,
  resolveUniqueNewsSlug,
  slugifyText,
  validateNewsPostInput,
} from "@/lib/news";
import type { NewsPostInput, NewsPostSaveMode } from "@/types/news";

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { session: null, error: "Kein Adminzugang." };
  }

  return { session, error: null };
}

function revalidateNewsPaths(slug?: string | null) {
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/");
  if (slug) {
    revalidatePath(`/news/${slug}`);
  }
}

function normalizeImageUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTournamentId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseNewsPostInput(input: NewsPostInput) {
  const validated = validateNewsPostInput(input);
  if (validated.error || !validated.value) {
    return { error: validated.error, value: null };
  }

  return {
    error: null,
    value: {
      ...validated.value,
      image_url: normalizeImageUrl(input.imageUrl),
      tournament_id: normalizeTournamentId(input.tournamentId),
      featured: Boolean(input.featured),
      published_at: parsePublishedAtInput(input.publishedAt),
    },
  };
}

function resolvePublishedAtForMode(
  mode: NewsPostSaveMode,
  parsedPublishedAt: string | null,
) {
  if (mode === "draft") {
    return null;
  }

  return parsedPublishedAt ?? new Date().toISOString();
}

export async function createNewsPostAction(
  input: NewsPostInput,
  mode: NewsPostSaveMode,
): Promise<{ error: string | null; id?: string }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = parseNewsPostInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const slug = await resolveUniqueNewsSlug(supabase, parsed.value.slug);
  const publishedAt = resolvePublishedAtForMode(mode, parsed.value.published_at);

  const { data, error } = await supabase
    .from("news_posts")
    .insert({
      title: parsed.value.title,
      slug,
      excerpt: parsed.value.excerpt,
      content: parsed.value.content,
      image_url: parsed.value.image_url,
      tournament_id: parsed.value.tournament_id,
      featured: parsed.value.featured,
      published_at: publishedAt,
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    return {
      error: toUserFacingDbError("Die News konnte nicht gespeichert werden.", error),
    };
  }

  revalidateNewsPaths(data.slug);
  revalidatePath(`/admin/news/${data.id}/bearbeiten`);
  return { error: null, id: data.id };
}

export async function updateNewsPostAction(
  id: string,
  input: NewsPostInput,
  mode: NewsPostSaveMode,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = parseNewsPostInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("news_posts")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !existing) {
    return {
      error: toUserFacingDbError("Die News wurde nicht gefunden.", loadError),
    };
  }

  const slugInput = input.slug?.trim();
  const requestedSlug = slugInput ? slugifyText(slugInput) : existing.slug;
  const slug =
    requestedSlug === existing.slug
      ? existing.slug
      : await resolveUniqueNewsSlug(supabase, requestedSlug, id);

  const publishedAt = resolvePublishedAtForMode(mode, parsed.value.published_at);

  const { error } = await supabase
    .from("news_posts")
    .update({
      title: parsed.value.title,
      slug,
      excerpt: parsed.value.excerpt,
      content: parsed.value.content,
      image_url: parsed.value.image_url,
      tournament_id: parsed.value.tournament_id,
      featured: parsed.value.featured,
      published_at: publishedAt,
    })
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Die News konnte nicht gespeichert werden.", error),
    };
  }

  revalidateNewsPaths(slug);
  if (existing.slug !== slug) {
    revalidateNewsPaths(existing.slug);
  }
  revalidatePath(`/admin/news/${id}/bearbeiten`);
  return { error: null };
}

export async function archiveNewsPostAction(id: string): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const supabase = await createClient();
  const { data: post, error: loadError } = await supabase
    .from("news_posts")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !post) {
    return {
      error: toUserFacingDbError("Die News wurde nicht gefunden.", loadError),
    };
  }

  const { error } = await supabase
    .from("news_posts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Die News konnte nicht archiviert werden.", error),
    };
  }

  revalidateNewsPaths(post.slug);
  revalidatePath(`/admin/news/${id}/bearbeiten`);
  return { error: null };
}

export async function restoreNewsPostAction(id: string): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const supabase = await createClient();
  const { data: post, error: loadError } = await supabase
    .from("news_posts")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !post) {
    return {
      error: toUserFacingDbError("Die News wurde nicht gefunden.", loadError),
    };
  }

  const { error } = await supabase
    .from("news_posts")
    .update({ archived_at: null })
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Die News konnte nicht wiederhergestellt werden.", error),
    };
  }

  revalidateNewsPaths(post.slug);
  revalidatePath(`/admin/news/${id}/bearbeiten`);
  return { error: null };
}

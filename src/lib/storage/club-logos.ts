import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

export const CLUB_LOGOS_BUCKET = "club-logos";
export const CLUB_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const CLUB_LOGO_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

type LogoMimeType = (typeof CLUB_LOGO_ALLOWED_MIME_TYPES)[number];

export function isAllowedClubLogoMimeType(value: string): value is LogoMimeType {
  return (CLUB_LOGO_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function clubLogoExtensionForMime(mimeType: LogoMimeType) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
  }
}

export function validateClubLogoFile(file: File): string | null {
  if (!file || file.size <= 0) {
    return "Bitte eine Bilddatei auswählen.";
  }

  if (file.size > CLUB_LOGO_MAX_BYTES) {
    return "Das Logo darf maximal 2 MB groß sein.";
  }

  if (!isAllowedClubLogoMimeType(file.type)) {
    return "Erlaubt sind PNG, JPEG, WebP oder GIF.";
  }

  return null;
}

export function buildExternalTeamLogoObjectPath(input: {
  tournamentId: string;
  externalTeamId: string;
  mimeType: LogoMimeType;
}) {
  const extension = clubLogoExtensionForMime(input.mimeType);
  return `external-teams/${input.tournamentId}/${input.externalTeamId}/${randomUUID()}.${extension}`;
}

export function isManagedClubLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) {
    return false;
  }

  return logoUrl.includes(`/storage/v1/object/public/${CLUB_LOGOS_BUCKET}/`);
}

export function clubLogoObjectPathFromPublicUrl(logoUrl: string) {
  const marker = `/storage/v1/object/public/${CLUB_LOGOS_BUCKET}/`;
  const index = logoUrl.indexOf(marker);
  if (index < 0) {
    return null;
  }

  const path = logoUrl.slice(index + marker.length).split("?")[0]?.trim();
  return path || null;
}

export async function uploadClubLogoFile(input: {
  supabase: SupabaseClient<Database>;
  file: File;
  objectPath: string;
}): Promise<{ publicUrl: string | null; error: string | null }> {
  const validationError = validateClubLogoFile(input.file);
  if (validationError) {
    return { publicUrl: null, error: validationError };
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const { error } = await input.supabase.storage
    .from(CLUB_LOGOS_BUCKET)
    .upload(input.objectPath, bytes, {
      contentType: input.file.type,
      upsert: false,
    });

  if (error) {
    return {
      publicUrl: null,
      error: "Das Logo konnte nicht hochgeladen werden.",
    };
  }

  const { data } = input.supabase.storage
    .from(CLUB_LOGOS_BUCKET)
    .getPublicUrl(input.objectPath);

  return { publicUrl: data.publicUrl, error: null };
}

export async function deleteManagedClubLogoIfOwned(input: {
  supabase: SupabaseClient<Database>;
  logoUrl: string | null | undefined;
}) {
  const path = input.logoUrl ? clubLogoObjectPathFromPublicUrl(input.logoUrl) : null;
  if (!path) {
    return;
  }

  await input.supabase.storage.from(CLUB_LOGOS_BUCKET).remove([path]);
}

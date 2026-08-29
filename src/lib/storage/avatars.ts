import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import {
  clubLogoExtensionForMime,
  formatSafeStorageError,
  isAllowedClubLogoMimeType,
  resolveClubLogoMimeType,
  validateClubLogoFile,
} from "@/lib/storage/club-logos";

export const AVATARS_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 1024 * 1024;

export function buildAvatarObjectPath(userId: string, mimeType: string) {
  if (!isAllowedClubLogoMimeType(mimeType)) {
    throw new Error("Invalid avatar mime type");
  }
  const extension = clubLogoExtensionForMime(mimeType);
  return `${userId}/${randomUUID()}.${extension}`;
}

export function isManagedAvatarUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl) {
    return false;
  }
  return avatarUrl.includes(`/storage/v1/object/public/${AVATARS_BUCKET}/`);
}

export function avatarObjectPathFromPublicUrl(avatarUrl: string) {
  const marker = `/storage/v1/object/public/${AVATARS_BUCKET}/`;
  const index = avatarUrl.indexOf(marker);
  if (index < 0) {
    return null;
  }
  const path = avatarUrl.slice(index + marker.length).split("?")[0]?.trim();
  return path || null;
}

export function validateAvatarFile(file: { name?: string; size: number; type?: string }): string | null {
  if (!file || file.size <= 0) {
    return "Bitte eine Bilddatei auswählen.";
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return "Das Profilbild darf maximal 1 MB groß sein.";
  }

  if (!resolveClubLogoMimeType(file)) {
    return "Erlaubt sind PNG, JPEG oder WebP.";
  }

  return validateClubLogoFile({ ...file, size: Math.min(file.size, AVATAR_MAX_BYTES) });
}

export async function uploadAvatarFile(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  file: File;
}): Promise<{ publicUrl: string | null; error: string | null }> {
  const validationError = validateAvatarFile(input.file);
  if (validationError) {
    return { publicUrl: null, error: validationError };
  }

  const mimeType = resolveClubLogoMimeType(input.file);
  if (!mimeType) {
    return { publicUrl: null, error: "Ungültiger Dateityp." };
  }

  const objectPath = buildAvatarObjectPath(input.userId, mimeType);
  const bytes = new Uint8Array(await input.file.arrayBuffer());

  const { error } = await input.supabase.storage.from(AVATARS_BUCKET).upload(objectPath, bytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    return {
      publicUrl: null,
      error: `Profilbild konnte nicht hochgeladen werden: ${formatSafeStorageError(error)}`,
    };
  }

  const { data } = input.supabase.storage.from(AVATARS_BUCKET).getPublicUrl(objectPath);
  if (!data.publicUrl) {
    return { publicUrl: null, error: "Profilbild-URL konnte nicht erzeugt werden." };
  }

  return { publicUrl: data.publicUrl, error: null };
}

export async function deleteManagedAvatarIfOwned(input: {
  supabase: SupabaseClient<Database>;
  avatarUrl: string | null | undefined;
  userId: string;
}) {
  const path = input.avatarUrl ? avatarObjectPathFromPublicUrl(input.avatarUrl) : null;
  if (!path || !path.startsWith(`${input.userId}/`)) {
    return;
  }

  await input.supabase.storage.from(AVATARS_BUCKET).remove([path]);
}

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

export const CLUB_LOGOS_BUCKET = "club-logos";
export const CLUB_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const CLUB_LOGO_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
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
  }
}

export function mimeTypeFromFileName(fileName: string): LogoMimeType | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return null;
}

/**
 * Resolve MIME for uploads. Some runtimes deliver empty File.type after FormData.
 * Never trusts SVG / GIF.
 */
export function resolveClubLogoMimeType(file: { type?: string; name?: string }): LogoMimeType | null {
  const declared = (file.type ?? "").trim().toLowerCase();
  if (isAllowedClubLogoMimeType(declared)) {
    return declared;
  }

  if (!declared || declared === "application/octet-stream") {
    return mimeTypeFromFileName(file.name ?? "");
  }

  return null;
}

export function validateClubLogoFile(file: { name?: string; size: number; type?: string }): string | null {
  if (!file || file.size <= 0) {
    return "Bitte eine Bilddatei auswählen.";
  }

  if (file.size > CLUB_LOGO_MAX_BYTES) {
    return "Das Logo darf maximal 2 MB groß sein.";
  }

  if (!resolveClubLogoMimeType(file)) {
    return "Erlaubt sind PNG, JPEG oder WebP.";
  }

  return null;
}

/**
 * FormData File detection that works across Node/Undici realms where
 * `value instanceof File` can falsely fail.
 */
export function getFormDataUploadFile(
  formData: FormData,
  key: string,
): { file: File | null; meta: { received: boolean; filename: string | null; mime: string | null; size: number | null } } {
  const value = formData.get(key);

  if (value == null || typeof value === "string") {
    return {
      file: null,
      meta: { received: false, filename: null, mime: null, size: null },
    };
  }

  const blob = value as Blob & { name?: string; type?: string; size: number };
  const hasBuffer = typeof blob.arrayBuffer === "function";
  const size = typeof blob.size === "number" ? blob.size : null;
  const filename = typeof blob.name === "string" ? blob.name : null;
  const mime = typeof blob.type === "string" ? blob.type : null;

  if (!hasBuffer || !size || size <= 0) {
    return {
      file: null,
      meta: { received: true, filename, mime, size },
    };
  }

  return {
    file: value as File,
    meta: { received: true, filename, mime, size },
  };
}

export function buildExternalTeamLogoObjectPath(input: {
  tournamentId: string;
  externalTeamId: string;
  mimeType: LogoMimeType;
}) {
  const extension = clubLogoExtensionForMime(input.mimeType);
  // Server-generated key only — never use original filenames or team names.
  return `tournaments/${input.tournamentId}/teams/${input.externalTeamId}/${randomUUID()}.${extension}`;
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

export function formatSafeStorageError(error: { message?: string; statusCode?: string | number; error?: string } | null) {
  if (!error) {
    return "Unbekannter Storage-Fehler.";
  }

  const parts = [
    error.statusCode != null ? String(error.statusCode) : null,
    error.error?.trim() || null,
    error.message?.trim() || null,
  ].filter(Boolean);

  const text = parts.join(" — ").slice(0, 240);
  return text || "Unbekannter Storage-Fehler.";
}

export async function uploadClubLogoFile(input: {
  supabase: SupabaseClient<Database>;
  file: File;
  objectPath: string;
  mimeType: LogoMimeType;
}): Promise<{ publicUrl: string | null; error: string | null; storageDetail: string | null }> {
  const validationError = validateClubLogoFile(input.file);
  if (validationError) {
    return { publicUrl: null, error: validationError, storageDetail: null };
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const { error } = await input.supabase.storage
    .from(CLUB_LOGOS_BUCKET)
    .upload(input.objectPath, bytes, {
      contentType: input.mimeType,
      upsert: false,
    });

  if (error) {
    const detail = formatSafeStorageError(error);
    console.error("[club-logos] upload failed", {
      bucket: CLUB_LOGOS_BUCKET,
      path: input.objectPath,
      code: "statusCode" in error ? (error as { statusCode?: string | number }).statusCode : undefined,
      message: error.message,
      errorName: "error" in error ? (error as { error?: string }).error : undefined,
    });

    return {
      publicUrl: null,
      error: `Logo konnte nicht hochgeladen werden: ${detail}`,
      storageDetail: detail,
    };
  }

  const { data } = input.supabase.storage.from(CLUB_LOGOS_BUCKET).getPublicUrl(input.objectPath);
  if (!data.publicUrl) {
    return {
      publicUrl: null,
      error: "Logo konnte nicht hochgeladen werden: Public URL fehlt.",
      storageDetail: "missing public url",
    };
  }

  return { publicUrl: data.publicUrl, error: null, storageDetail: null };
}

export async function deleteManagedClubLogoIfOwned(input: {
  supabase: SupabaseClient<Database>;
  logoUrl: string | null | undefined;
}) {
  const path = input.logoUrl ? clubLogoObjectPathFromPublicUrl(input.logoUrl) : null;
  if (!path) {
    return;
  }

  const { error } = await input.supabase.storage.from(CLUB_LOGOS_BUCKET).remove([path]);
  if (error) {
    console.error("[club-logos] delete failed", {
      bucket: CLUB_LOGOS_BUCKET,
      path,
      message: error.message,
    });
  }
}

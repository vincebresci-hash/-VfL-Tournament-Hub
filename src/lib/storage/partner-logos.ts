import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import {
  formatSafeStorageError,
  getFormDataUploadFile,
  resolveClubLogoMimeType,
  validateClubLogoFile,
  clubLogoExtensionForMime,
  CLUB_LOGO_ALLOWED_MIME_TYPES,
  CLUB_LOGO_MAX_BYTES,
} from "@/lib/storage/club-logos";

export const PARTNER_LOGOS_BUCKET = "partner-logos";
export const PARTNER_LOGO_MAX_BYTES = CLUB_LOGO_MAX_BYTES;
export const PARTNER_LOGO_ALLOWED_MIME_TYPES = CLUB_LOGO_ALLOWED_MIME_TYPES;

type LogoMimeType = (typeof PARTNER_LOGO_ALLOWED_MIME_TYPES)[number];

export {
  getFormDataUploadFile,
  resolveClubLogoMimeType as resolvePartnerLogoMimeType,
  validateClubLogoFile as validatePartnerLogoFile,
};

export function buildPartnerLogoObjectPath(input: {
  partnerId: string;
  mimeType: LogoMimeType;
}) {
  const extension = clubLogoExtensionForMime(input.mimeType);
  // Server-generated key only — never use original filenames or partner names.
  return `partners/${input.partnerId}/${randomUUID()}.${extension}`;
}

export function partnerLogoPathPrefix(partnerId: string) {
  return `partners/${partnerId}/`;
}

export function isManagedPartnerLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) {
    return false;
  }

  return logoUrl.includes(`/storage/v1/object/public/${PARTNER_LOGOS_BUCKET}/`);
}

export function partnerLogoObjectPathFromPublicUrl(logoUrl: string) {
  const marker = `/storage/v1/object/public/${PARTNER_LOGOS_BUCKET}/`;
  const index = logoUrl.indexOf(marker);
  if (index < 0) {
    return null;
  }

  const path = logoUrl.slice(index + marker.length).split("?")[0]?.trim();
  return path || null;
}

/** True when the public URL points at this partner's managed storage prefix. */
export function isPartnerManagedLogoUrl(
  logoUrl: string | null | undefined,
  partnerId: string,
) {
  const path = logoUrl ? partnerLogoObjectPathFromPublicUrl(logoUrl) : null;
  if (!path || !partnerId) {
    return false;
  }

  return path.startsWith(partnerLogoPathPrefix(partnerId));
}

export async function uploadPartnerLogoFile(input: {
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
    .from(PARTNER_LOGOS_BUCKET)
    .upload(input.objectPath, bytes, {
      contentType: input.mimeType,
      upsert: false,
    });

  if (error) {
    const detail = formatSafeStorageError(error);
    console.error("[partner-logos] upload failed", {
      bucket: PARTNER_LOGOS_BUCKET,
      path: input.objectPath,
      message: error.message,
    });

    return {
      publicUrl: null,
      error: `Logo konnte nicht hochgeladen werden: ${detail}`,
      storageDetail: detail,
    };
  }

  const { data } = input.supabase.storage
    .from(PARTNER_LOGOS_BUCKET)
    .getPublicUrl(input.objectPath);
  if (!data.publicUrl) {
    return {
      publicUrl: null,
      error: "Logo konnte nicht hochgeladen werden: Public URL fehlt.",
      storageDetail: "missing public url",
    };
  }

  return { publicUrl: data.publicUrl, error: null, storageDetail: null };
}

export async function deleteManagedPartnerLogoIfOwned(input: {
  supabase: SupabaseClient<Database>;
  logoUrl: string | null | undefined;
  /** When set, only delete if the object path starts with this prefix. */
  requiredPathPrefix?: string;
}) {
  const path = input.logoUrl ? partnerLogoObjectPathFromPublicUrl(input.logoUrl) : null;
  if (!path) {
    return;
  }

  if (input.requiredPathPrefix && !path.startsWith(input.requiredPathPrefix)) {
    console.error("[partner-logos] delete skipped: path prefix mismatch", {
      bucket: PARTNER_LOGOS_BUCKET,
      path,
      requiredPathPrefix: input.requiredPathPrefix,
    });
    return;
  }

  const { error } = await input.supabase.storage
    .from(PARTNER_LOGOS_BUCKET)
    .remove([path]);
  if (error) {
    console.error("[partner-logos] delete failed", {
      bucket: PARTNER_LOGOS_BUCKET,
      path,
      message: error.message,
    });
  }
}

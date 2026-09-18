import type { PartnerRow } from "@/lib/supabase/database";
import type { Partner, PartnerInput, PublicPartner } from "@/types/partner";

export function toPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicPartner(row: PartnerRow): PublicPartner {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    sortOrder: row.sort_order,
  };
}

export function cleanOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Optional website: empty allowed.
 * Accepts bare domains (adds https://) or http(s) URLs.
 * Rejects javascript:/data:/file: and other non-http(s) schemes.
 */
export function normalizePartnerWebsiteUrl(
  value: string | null | undefined,
): { ok: true; url: string | null } | { ok: false; error: string } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { ok: true, url: null };
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:")
  ) {
    return { ok: false, error: "Ungültige Website-URL." };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Website muss mit http:// oder https:// beginnen." };
    }
    if (!url.hostname.includes(".")) {
      return { ok: false, error: "Bitte eine gültige Website angeben." };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "Bitte eine gültige Website angeben." };
  }
}

export function validatePartnerInput(
  input: PartnerInput,
): { error: string | null; value: null } | {
  error: null;
  value: {
    name: string;
    website_url: string | null;
    is_active: boolean;
    sort_order: number;
  };
} {
  const name = input.name?.trim() ?? "";
  if (!name) {
    return { error: "Bitte einen Partnernamen angeben.", value: null };
  }

  const website = normalizePartnerWebsiteUrl(input.websiteUrl);
  if (!website.ok) {
    return { error: website.error, value: null };
  }

  const sortOrderRaw = Number(input.sortOrder);
  const sortOrder = Number.isFinite(sortOrderRaw)
    ? Math.trunc(sortOrderRaw)
    : 0;

  return {
    error: null,
    value: {
      name,
      website_url: website.url,
      is_active: Boolean(input.isActive),
      sort_order: sortOrder,
    },
  };
}

export function comparePartnersForPublicOrder(
  a: Pick<PublicPartner, "sortOrder" | "name" | "id">,
  b: Pick<PublicPartner, "sortOrder" | "name" | "id">,
) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  const byName = a.name.localeCompare(b.name, "de");
  if (byName !== 0) {
    return byName;
  }
  return a.id.localeCompare(b.id);
}

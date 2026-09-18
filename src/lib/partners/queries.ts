import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import {
  comparePartnersForPublicOrder,
  toPartner,
  toPublicPartner,
} from "@/lib/partners/partner";
import type { PartnerRow } from "@/lib/supabase/database";
import type { Partner, PublicPartner } from "@/types/partner";

const PARTNER_SELECT =
  "id, name, logo_url, website_url, is_active, sort_order, created_at, updated_at";

/**
 * Active partners for public homepage + /partner.
 * RLS additionally enforces is_active = true for anon.
 */
export async function listPublicActivePartners(): Promise<PublicPartner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .select(PARTNER_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as PartnerRow[])
    .map(toPublicPartner)
    .filter((partner) => Boolean(partner.name.trim()))
    .sort(comparePartnersForPublicOrder);
}

export async function listAdminPartners(): Promise<{
  partners: Partner[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .select(PARTNER_SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data) {
    return { partners: [], ready: !isMissingRelationError(error) };
  }

  return {
    partners: (data as PartnerRow[]).map(toPartner),
    ready: true,
  };
}

export async function getAdminPartner(id: string): Promise<Partner | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .select(PARTNER_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toPartner(data as PartnerRow);
}

import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import {
  comparePartnersForPublicOrder,
  toPartner,
  toPublicPartner,
} from "@/lib/partners/partner";
import type { PartnerRow, TournamentPartnerRow } from "@/lib/supabase/database";
import type { Partner, PublicPartner } from "@/types/partner";

const PARTNER_SELECT =
  "id, name, logo_url, website_url, is_active, sort_order, created_at, updated_at";

/**
 * Active partners for public homepage + /partner.
 * RLS additionally enforces is_active = true for anon.
 * Unchanged by Phase 2A tournament assignments.
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

/**
 * Active partners assigned to a specific tournament (Phase 2C foundation).
 * Inactive assigned partners are excluded. Empty when none / table missing.
 */
export async function listPublicActivePartnersForTournament(
  tournamentId: string,
): Promise<PublicPartner[]> {
  const id = tournamentId?.trim();
  if (!id) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_partners")
    .select(`partner_id, partners!inner(${PARTNER_SELECT})`)
    .eq("tournament_id", id)
    .eq("partners.is_active", true);

  if (error || !data) {
    return [];
  }

  type JoinRow = {
    partner_id: string;
    partners: PartnerRow | PartnerRow[] | null;
  };

  const partners = (data as JoinRow[])
    .map((row) => {
      const partner = Array.isArray(row.partners) ? row.partners[0] : row.partners;
      return partner ? toPublicPartner(partner) : null;
    })
    .filter((partner): partner is PublicPartner => Boolean(partner?.name.trim()))
    .sort(comparePartnersForPublicOrder);

  return partners;
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

export type AdminTournamentPartnerAssignmentState = {
  /** Active partners available for new assignment checkboxes. */
  availableActivePartners: Partner[];
  /** Currently assigned partners (active + inactive). */
  assignedPartners: Partner[];
  assignedPartnerIds: string[];
  /** Assigned partners that are inactive (Phase 2B "inaktiv" label). */
  inactiveAssignedPartners: Partner[];
  ready: boolean;
};

/**
 * Admin foundation for Phase 2B assignment UI.
 * Requires tournaments.manage (+ partners_select_tournament_manage) for inactive rows.
 * No mutation — read-only.
 */
export async function getAdminTournamentPartnerAssignmentState(
  tournamentId: string,
): Promise<AdminTournamentPartnerAssignmentState> {
  const empty: AdminTournamentPartnerAssignmentState = {
    availableActivePartners: [],
    assignedPartners: [],
    assignedPartnerIds: [],
    inactiveAssignedPartners: [],
    ready: false,
  };

  const id = tournamentId?.trim();
  if (!id) {
    return empty;
  }

  const supabase = await createClient();

  const [partnersResult, assignmentsResult] = await Promise.all([
    supabase
      .from("partners")
      .select(PARTNER_SELECT)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("tournament_partners")
      .select("id, tournament_id, partner_id, created_at")
      .eq("tournament_id", id),
  ]);

  if (partnersResult.error || !partnersResult.data) {
    return {
      ...empty,
      ready: !isMissingRelationError(partnersResult.error),
    };
  }

  if (assignmentsResult.error || !assignmentsResult.data) {
    return {
      ...empty,
      ready: !isMissingRelationError(assignmentsResult.error),
    };
  }

  const allPartners = (partnersResult.data as PartnerRow[]).map(toPartner);
  const assignedIds = new Set(
    (assignmentsResult.data as TournamentPartnerRow[]).map((row) => row.partner_id),
  );

  const assignedPartners = allPartners
    .filter((partner) => assignedIds.has(partner.id))
    .sort((a, b) =>
      comparePartnersForPublicOrder(
        { id: a.id, name: a.name, sortOrder: a.sortOrder },
        { id: b.id, name: b.name, sortOrder: b.sortOrder },
      ),
    );

  const availableActivePartners = allPartners.filter((partner) => partner.isActive);
  const inactiveAssignedPartners = assignedPartners.filter((partner) => !partner.isActive);

  return {
    availableActivePartners,
    assignedPartners,
    assignedPartnerIds: assignedPartners.map((partner) => partner.id),
    inactiveAssignedPartners,
    ready: true,
  };
}

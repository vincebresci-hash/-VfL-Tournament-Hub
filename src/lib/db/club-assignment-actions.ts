"use server";

/**
 * CL Release 6 §1 — complete, assignable club list + inline club creation for
 * the schedule page.
 *
 * Why service role: the per-club RLS SELECT policy (clubs_select_own_or_admin)
 * only exposes clubs the signed-in admin has object-scoped clubs.view on, which
 * makes the assignment dropdown incomplete. These helpers run ONLY behind an
 * explicit schedule.manage RBAC gate and expose nothing sensitive (id, name,
 * city). All other club access keeps its RLS. No auto-merge of duplicates.
 */

import { requireScheduleManage } from "@/lib/rbac/action-access";
import { findDuplicateClubs } from "@/lib/schedule/club-assignment-suggest";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export type AssignableClub = { id: string; name: string; city: string | null };

function toClub(row: { id: unknown; name: unknown; city: unknown }): AssignableClub | null {
  const id = String(row.id ?? "");
  const name = String(row.name ?? "").trim();
  if (!id || !name) {
    return null;
  }
  const city = row.city ? String(row.city).trim() : "";
  return { id, name, city: city || null };
}

const CLUB_DIRECTORY_UNAVAILABLE =
  "Die vollständige Vereinsliste ist in dieser Umgebung nicht verfügbar. Nutze für Zuordnungen die Teilnehmerverwaltung.";

type ClubDirectoryResult =
  | { clubs: AssignableClub[]; error: null }
  | { clubs: []; error: string };

async function readAllClubs(): Promise<ClubDirectoryResult> {
  const db = createServiceRoleClientIfConfigured();
  if (!db) {
    return { clubs: [], error: CLUB_DIRECTORY_UNAVAILABLE };
  }
  const { data, error } = await db.from("clubs").select("id, name, city").order("name", { ascending: true });
  if (error || !data) {
    return { clubs: [], error: "Die Vereinsliste konnte nicht geladen werden." };
  }
  return {
    clubs: data.map(toClub).filter((club): club is AssignableClub => club !== null),
    error: null,
  };
}

/** The full assignable club list (schedule.manage only). */
export async function listAssignableClubOptions(): Promise<ClubDirectoryResult> {
  const access = await requireScheduleManage();
  if (access.error || !access.session) {
    return { clubs: [], error: access.error ?? "Keine Berechtigung für diese Aktion." };
  }
  return readAllClubs();
}

export type CreateClubResult = {
  club: AssignableClub | null;
  error: string | null;
  /** Existing clubs that would duplicate the requested name (confirm to proceed). */
  duplicates: AssignableClub[];
};

/**
 * Create a club from the schedule page. Returns existing duplicates for
 * confirmation instead of creating, unless allowDuplicate is set. Never merges.
 */
export async function createAssignableClubAction(input: {
  name: string;
  city?: string | null;
  allowDuplicate?: boolean;
}): Promise<CreateClubResult> {
  const access = await requireScheduleManage();
  if (access.error || !access.session) {
    return { club: null, error: access.error ?? "Keine Berechtigung für diese Aktion.", duplicates: [] };
  }

  const name = (input.name ?? "").trim();
  if (name.length < 2) {
    return { club: null, error: "Bitte einen gültigen Vereinsnamen angeben.", duplicates: [] };
  }

  const existing = await readAllClubs();
  if (existing.error) {
    return { club: null, error: existing.error, duplicates: [] };
  }
  const duplicates = findDuplicateClubs(name, existing.clubs);
  if (duplicates.length > 0 && input.allowDuplicate !== true) {
    // Surface the duplicates; the admin decides (no silent create, no merge).
    return { club: null, error: null, duplicates };
  }

  const db = createServiceRoleClientIfConfigured();
  if (!db) {
    return { club: null, error: CLUB_DIRECTORY_UNAVAILABLE, duplicates };
  }
  // created_by stays NULL: a tournament-admin-created club is not owned by one
  // profile, and the partial unique index on created_by excludes NULLs.
  const inserted = await db
    .from("clubs")
    .insert({ name, city: (input.city ?? "").trim() || null, created_by: null })
    .select("id, name, city")
    .single();
  if (inserted.error || !inserted.data) {
    return { club: null, error: "Der Verein konnte nicht angelegt werden.", duplicates };
  }
  const club = toClub(inserted.data);
  if (!club) {
    return { club: null, error: "Der Verein konnte nicht angelegt werden.", duplicates };
  }
  return { club, error: null, duplicates: [] };
}

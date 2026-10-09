"use server";

import { revalidatePath } from "next/cache";
import {
  emptyAdminNavBadgeCounts,
  isAdminNavBadgeKey,
  type AdminNavBadgeCounts,
  type AdminNavBadgeKey,
  type AdminNavCursor,
} from "@/lib/admin/nav-badges";
import { isMissingRelationError } from "@/lib/db/errors";
import { createClient } from "@/lib/supabase/server";

export async function loadAdminNavBadgeCountsAction(): Promise<{
  counts: AdminNavBadgeCounts;
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_nav_badge_counts");

  if (error) {
    return {
      counts: emptyAdminNavBadgeCounts,
      ready: !isMissingRelationError(error),
    };
  }

  const counts: AdminNavBadgeCounts = { ...emptyAdminNavBadgeCounts };
  for (const row of data ?? []) {
    if (isAdminNavBadgeKey(row.nav_key)) {
      counts[row.nav_key] = Math.max(0, Number(row.unread_count) || 0);
    }
  }

  return { counts, ready: true };
}

export async function markAdminNavSeenAction(input: {
  navKey: AdminNavBadgeKey;
  cursor: AdminNavCursor;
}): Promise<{ advanced: boolean; error: string | null }> {
  if (!isAdminNavBadgeKey(input.navKey)) {
    return { advanced: false, error: "Ungültiger Navigationsschlüssel." };
  }

  if (!input.cursor.seenUntil || !input.cursor.seenId) {
    return { advanced: false, error: null };
  }

  // Cursor must be the max loaded snapshot row. The RPC rejects pairs that do
  // not match a visible authoritative DB row (blocks future-cursor suppression).
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_admin_nav_seen_state", {
    p_nav_key: input.navKey,
    p_seen_until: input.cursor.seenUntil,
    p_seen_id: input.cursor.seenId,
  });

  if (error) {
    if (isMissingRelationError(error)) {
      return { advanced: false, error: null };
    }
    return { advanced: false, error: "Lesestatus konnte nicht gespeichert werden." };
  }

  const advanced = Boolean(data);
  if (advanced) {
    revalidatePath("/admin", "layout");
  }

  return { advanced, error: null };
}

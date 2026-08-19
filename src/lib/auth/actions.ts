"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readUserMetadata } from "@/lib/auth/user";
import { isMissingRelationError, toUserFacingDbError } from "@/lib/db/errors";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function ensureClubForCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { clubId: null as string | null, error: "not-authenticated" as const };
  }

  const metadata = readUserMetadata(user);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, club_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError && isMissingRelationError(profileError)) {
    return { clubId: null, error: "database-missing" as const };
  }

  if (profile?.club_id) {
    return { clubId: profile.club_id, error: null };
  }

  if (profile?.role && profile.role !== "club") {
    return { clubId: null, error: null };
  }

  const clubName = metadata.clubName || "Neuer Verein";
  const { data: clubId, error } = await supabase.rpc("ensure_own_club", {
    p_name: clubName,
    p_city: metadata.clubCity || null,
    p_website: metadata.clubWebsite,
  });

  if (error) {
    return {
      clubId: null,
      error: toUserFacingDbError(
        "Der Verein konnte nicht zugeordnet werden. Bitte versuche es erneut.",
        error,
      ),
    };
  }

  return { clubId: clubId ?? null, error: null };
}

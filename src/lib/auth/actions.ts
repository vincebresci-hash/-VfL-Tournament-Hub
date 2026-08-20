"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readUserMetadata } from "@/lib/auth/user";
import { AUTH_ERROR_MESSAGES } from "@/lib/auth/messages";
import { isMissingRelationError, toUserFacingDbError } from "@/lib/db/errors";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateAdminProfileAction(input: {
  firstName: string;
  lastName: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Bitte zuerst anmelden." };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  if (!firstName || !lastName) {
    return { error: "Bitte Vorname und Nachname angeben." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
    })
    .eq("id", user.id);

  if (error) {
    return {
      error: toUserFacingDbError("Das Profil konnte nicht gespeichert werden.", error),
    };
  }

  await supabase.auth.updateUser({
    data: {
      first_name: firstName,
      last_name: lastName,
    },
  });

  return { error: null };
}

export async function updatePasswordAction(input: {
  currentPassword: string;
  nextPassword: string;
  nextPasswordConfirm: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Bitte zuerst anmelden." };
  }

  if (input.nextPassword.length < 8) {
    return { error: "Das neue Passwort muss mindestens 8 Zeichen haben." };
  }

  if (input.nextPassword !== input.nextPasswordConfirm) {
    return { error: "Die Passwörter stimmen nicht überein." };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: input.currentPassword,
  });

  if (reauthError) {
    return { error: "Das aktuelle Passwort ist nicht korrekt." };
  }

  const { error } = await supabase.auth.updateUser({
    password: input.nextPassword,
  });

  if (error) {
    return { error: AUTH_ERROR_MESSAGES.updatePasswordGeneric };
  }

  return { error: null };
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

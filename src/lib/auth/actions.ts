"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readUserMetadata } from "@/lib/auth/user";
import { AUTH_ERROR_MESSAGES } from "@/lib/auth/messages";
import { validateNewPassword } from "@/lib/auth/validation";
import { isMissingRelationError, toUserFacingDbError } from "@/lib/db/errors";
import { getFormDataUploadFile } from "@/lib/storage/club-logos";
import {
  deleteManagedAvatarIfOwned,
  uploadAvatarFile,
} from "@/lib/storage/avatars";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

const PERSONAL_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "display_name",
  "phone",
  "job_title",
  "avatar_url",
] as const;

async function updateOwnPersonalProfile(input: {
  firstName: string;
  lastName: string;
  displayName?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
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
      display_name: input.displayName?.trim() || null,
      phone: input.phone?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      avatar_url: input.avatarUrl?.trim() || null,
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

export async function updateAdminProfileAction(input: {
  firstName: string;
  lastName: string;
  displayName?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
}): Promise<{ error: string | null }> {
  return updateOwnPersonalProfile(input);
}

export async function updatePersonalProfileAction(input: {
  firstName: string;
  lastName: string;
  displayName?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
}): Promise<{ error: string | null }> {
  return updateOwnPersonalProfile(input);
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

  const passwordError = validateNewPassword(input.nextPassword);
  if (passwordError) {
    return {
      error:
        passwordError === "Bitte ein Passwort angeben."
          ? "Bitte ein neues Passwort angeben."
          : "Das neue Passwort muss mindestens 8 Zeichen haben.",
    };
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

export async function uploadAvatarAction(
  formData: FormData,
): Promise<{ error: string | null; avatarUrl?: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Bitte zuerst anmelden." };
  }

  const { file } = getFormDataUploadFile(formData, "avatar");
  if (!file) {
    return { error: "Bitte eine Bilddatei auswählen." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { publicUrl, error: uploadError } = await uploadAvatarFile({
    supabase,
    userId: user.id,
    file,
  });

  if (uploadError || !publicUrl) {
    return { error: uploadError ?? "Upload fehlgeschlagen." };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) {
    return {
      error: toUserFacingDbError("Profilbild konnte nicht gespeichert werden.", updateError),
    };
  }

  await deleteManagedAvatarIfOwned({
    supabase,
    avatarUrl: profile?.avatar_url,
    userId: user.id,
  });

  revalidatePath("/verein/profil");
  revalidatePath("/admin/profil");
  return { error: null, avatarUrl: publicUrl };
}

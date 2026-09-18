"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePartnersManage } from "@/lib/rbac/action-access";
import { toUserFacingDbError } from "@/lib/db/errors";
import { validatePartnerInput } from "@/lib/partners/partner";
import {
  buildPartnerLogoObjectPath,
  deleteManagedPartnerLogoIfOwned,
  getFormDataUploadFile,
  isManagedPartnerLogoUrl,
  partnerLogoPathPrefix,
  resolvePartnerLogoMimeType,
  uploadPartnerLogoFile,
  validatePartnerLogoFile,
} from "@/lib/storage/partner-logos";
import type { PartnerInput } from "@/types/partner";
import type { PartnerRow } from "@/lib/supabase/database";

function revalidatePartnerPaths() {
  revalidatePath("/");
  revalidatePath("/partner");
  revalidatePath("/admin/partner");
}

export async function createPartnerAction(
  input: PartnerInput,
): Promise<{ error: string | null; id?: string }> {
  const access = await requirePartnersManage();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = validatePartnerInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .insert({
      name: parsed.value.name,
      website_url: parsed.value.website_url,
      is_active: parsed.value.is_active,
      sort_order: parsed.value.sort_order,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: toUserFacingDbError("Der Partner konnte nicht angelegt werden.", error),
    };
  }

  revalidatePartnerPaths();
  revalidatePath(`/admin/partner/${data.id}`);
  return { error: null, id: data.id };
}

export async function updatePartnerAction(
  id: string,
  input: PartnerInput,
): Promise<{ error: string | null }> {
  const access = await requirePartnersManage();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const parsed = validatePartnerInput(input);
  if (parsed.error || !parsed.value) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("partners")
    .update({
      name: parsed.value.name,
      website_url: parsed.value.website_url,
      is_active: parsed.value.is_active,
      sort_order: parsed.value.sort_order,
    })
    .eq("id", id);

  if (error) {
    return {
      error: toUserFacingDbError("Der Partner konnte nicht gespeichert werden.", error),
    };
  }

  revalidatePartnerPaths();
  revalidatePath(`/admin/partner/${id}`);
  return { error: null };
}

export async function deletePartnerAction(
  id: string,
): Promise<{ error: string | null; ok?: true }> {
  const access = await requirePartnersManage();
  if (access.error || !access.session) {
    return { error: access.error };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("partners")
    .select("id, logo_url")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return {
      error: toUserFacingDbError("Der Partner konnte nicht gelöscht werden.", loadError),
    };
  }

  if (!existing) {
    return { error: "Partner nicht gefunden." };
  }

  const row = existing as Pick<PartnerRow, "id" | "logo_url">;
  const previousLogoUrl = row.logo_url;

  const { error } = await supabase.from("partners").delete().eq("id", id);
  if (error) {
    return {
      error: toUserFacingDbError("Der Partner konnte nicht gelöscht werden.", error),
    };
  }

  await deleteManagedPartnerLogoIfOwned({
    supabase,
    logoUrl: previousLogoUrl,
    requiredPathPrefix: partnerLogoPathPrefix(id),
  });

  revalidatePartnerPaths();
  return { error: null, ok: true };
}

export async function updatePartnerLogoAction(input: {
  partnerId: string;
  mode: "upload" | "remove";
  logoFile?: File | null;
}): Promise<{ error: string | null; notice: string | null; logoUrl?: string | null }> {
  const access = await requirePartnersManage();
  if (access.error || !access.session) {
    return { error: access.error, notice: null };
  }

  const partnerId = input.partnerId?.trim();
  if (!partnerId) {
    return { error: "Partner fehlt.", notice: null };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("partners")
    .select("id, logo_url")
    .eq("id", partnerId)
    .maybeSingle();

  if (loadError || !existing) {
    return {
      error: toUserFacingDbError("Partner nicht gefunden.", loadError),
      notice: null,
    };
  }

  const row = existing as Pick<PartnerRow, "id" | "logo_url">;
  const previousLogoUrl = row.logo_url;

  if (input.mode === "remove") {
    const { error } = await supabase
      .from("partners")
      .update({ logo_url: null })
      .eq("id", partnerId);

    if (error) {
      return {
        error: toUserFacingDbError("Logo konnte nicht entfernt werden.", error),
        notice: null,
      };
    }

    await deleteManagedPartnerLogoIfOwned({
      supabase,
      logoUrl: previousLogoUrl,
      requiredPathPrefix: partnerLogoPathPrefix(partnerId),
    });

    revalidatePartnerPaths();
    revalidatePath(`/admin/partner/${partnerId}`);
    return { error: null, notice: "Logo entfernt.", logoUrl: null };
  }

  const file = input.logoFile ?? null;
  if (!file) {
    return { error: "Bitte eine Bilddatei auswählen.", notice: null };
  }

  const validationError = validatePartnerLogoFile(file);
  if (validationError) {
    return { error: validationError, notice: null };
  }

  const mimeType = resolvePartnerLogoMimeType(file);
  if (!mimeType) {
    return { error: "Erlaubt sind PNG, JPEG oder WebP.", notice: null };
  }

  const objectPath = buildPartnerLogoObjectPath({ partnerId, mimeType });
  const uploaded = await uploadPartnerLogoFile({
    supabase,
    file,
    objectPath,
    mimeType,
  });

  if (uploaded.error || !uploaded.publicUrl) {
    return { error: uploaded.error ?? "Logo-Upload fehlgeschlagen.", notice: null };
  }

  const { error: updateError } = await supabase
    .from("partners")
    .update({ logo_url: uploaded.publicUrl })
    .eq("id", partnerId);

  if (updateError) {
    await deleteManagedPartnerLogoIfOwned({
      supabase,
      logoUrl: uploaded.publicUrl,
      requiredPathPrefix: partnerLogoPathPrefix(partnerId),
    });
    return {
      error: toUserFacingDbError(
        "Logo wurde hochgeladen, konnte aber nicht gespeichert werden.",
        updateError,
      ),
      notice: null,
    };
  }

  if (
    previousLogoUrl &&
    previousLogoUrl !== uploaded.publicUrl &&
    isManagedPartnerLogoUrl(previousLogoUrl)
  ) {
    await deleteManagedPartnerLogoIfOwned({
      supabase,
      logoUrl: previousLogoUrl,
      requiredPathPrefix: partnerLogoPathPrefix(partnerId),
    });
  }

  revalidatePartnerPaths();
  revalidatePath(`/admin/partner/${partnerId}`);
  return {
    error: null,
    notice: previousLogoUrl ? "Logo ersetzt." : "Logo gespeichert.",
    logoUrl: uploaded.publicUrl,
  };
}

export async function uploadPartnerLogoFormAction(
  formData: FormData,
): Promise<{ error: string | null; notice: string | null; logoUrl?: string | null }> {
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const { file } = getFormDataUploadFile(formData, "logoFile");

  return updatePartnerLogoAction({
    partnerId,
    mode: "upload",
    logoFile: file,
  });
}

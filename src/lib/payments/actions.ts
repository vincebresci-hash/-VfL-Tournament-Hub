"use server";

import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { toUserFacingDbError } from "@/lib/db/errors";
import {
  normalizePaymentUpdate,
  parseParticipationFeeInput,
} from "@/lib/payments/normalize";
import { createClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/types/payment";

export type PaymentActionResult = {
  error: string | null;
  notice?: string | null;
};

export async function updateApplicationPaymentAction(input: {
  applicationId: string;
  paymentStatus: PaymentStatus;
  participationFeeInput: string;
  paidAtInput: string;
  paymentNote: string;
}): Promise<PaymentActionResult> {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { error: "Kein Admin-Zugang." };
  }

  const participationFee = parseParticipationFeeInput(input.participationFeeInput);
  if (Number.isNaN(participationFee)) {
    return { error: "Die Startgebühr muss null oder eine positive Zahl sein." };
  }

  const paidAtInput = input.paidAtInput.trim();
  const paidAt = paidAtInput
    ? new Date(`${paidAtInput}T12:00:00.000Z`).toISOString()
    : null;

  if (paidAtInput && Number.isNaN(Date.parse(`${paidAtInput}T12:00:00.000Z`))) {
    return { error: "Das Zahlungsdatum ist ungültig." };
  }

  const supabase = await createClient();
  const { data: application, error: loadError } = await supabase
    .from("applications")
    .select("id, status, paid_at")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (loadError || !application) {
    return { error: "Bewerbung nicht gefunden." };
  }

  if (application.status !== "accepted") {
    return { error: "Zahlungsstatus ist nur für angenommene Bewerbungen verfügbar." };
  }

  const update = normalizePaymentUpdate({
    paymentStatus: input.paymentStatus,
    participationFee,
    paidAt: input.paymentStatus === "paid" ? paidAt : null,
    paymentNote: input.paymentNote,
    existingPaidAt: application.paid_at,
  });

  const { error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", input.applicationId);

  if (error) {
    return { error: toUserFacingDbError("Zahlungsstatus konnte nicht gespeichert werden.", error) };
  }

  revalidatePath("/admin/bewerbungen");
  revalidatePath(`/admin/bewerbungen/${input.applicationId}`);
  revalidatePath("/verein/bewerbungen");
  revalidatePath(`/verein/bewerbungen/${input.applicationId}`);
  revalidatePath("/teilnahme");

  return { error: null, notice: "Zahlungsstatus gespeichert." };
}

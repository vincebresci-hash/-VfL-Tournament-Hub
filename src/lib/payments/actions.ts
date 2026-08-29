"use server";

import { revalidatePath } from "next/cache";
import {
  requirePaymentsManage,
  requirePaymentsView,
} from "@/lib/rbac/action-access";
import { toUserFacingDbError } from "@/lib/db/errors";
import {
  getAdminPaymentRecord,
  listAdminPaymentRecords,
} from "@/lib/payments/queries";
import {
  normalizePaymentAdminNote,
  normalizePaymentUpdate,
  parseParticipationFeeInput,
} from "@/lib/payments/normalize";
import { createClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/types/payment";

export type PaymentActionResult = {
  error: string | null;
  notice?: string | null;
};

export async function loadAdminPaymentRecordsAction(): Promise<{
  records: Awaited<ReturnType<typeof listAdminPaymentRecords>>["records"];
  ready: boolean;
  error: string | null;
}> {
  const access = await requirePaymentsView();
  if (access.error || !access.session) {
    return { records: [], ready: false, error: access.error };
  }

  const result = await listAdminPaymentRecords();
  return { ...result, error: null };
}

export async function loadAdminPaymentRecordAction(applicationId: string): Promise<{
  record: Awaited<ReturnType<typeof getAdminPaymentRecord>>;
  error: string | null;
}> {
  const access = await requirePaymentsView();
  if (access.error || !access.session) {
    return { record: null, error: access.error };
  }

  const record = await getAdminPaymentRecord(applicationId);
  if (!record) {
    return { record: null, error: "Zahlungsdatensatz nicht gefunden." };
  }

  return { record, error: null };
}

export async function canManagePaymentsAction(): Promise<boolean> {
  const access = await requirePaymentsManage();
  return !access.error && access.session !== null;
}

export async function updateApplicationPaymentAction(input: {
  applicationId: string;
  paymentStatus: PaymentStatus;
  participationFeeInput: string;
  paidAtInput: string;
  paymentNote: string;
}): Promise<PaymentActionResult> {
  const access = await requirePaymentsManage();
  if (access.error || !access.session) {
    return { error: access.error };
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
    existingPaidAt: application.paid_at,
  });
  const paymentNote = normalizePaymentAdminNote(input.paymentNote);

  const { error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", input.applicationId);

  if (error) {
    return { error: toUserFacingDbError("Zahlungsstatus konnte nicht gespeichert werden.", error) };
  }

  const { error: noteError } = paymentNote
    ? await supabase.from("application_payment_admin_notes").upsert(
        {
          application_id: input.applicationId,
          payment_note: paymentNote,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "application_id" },
      )
    : await supabase
        .from("application_payment_admin_notes")
        .delete()
        .eq("application_id", input.applicationId);

  if (noteError) {
    return {
      error: toUserFacingDbError("Zahlungsnotiz konnte nicht gespeichert werden.", noteError),
    };
  }

  revalidatePath("/admin/bewerbungen");
  revalidatePath(`/admin/bewerbungen/${input.applicationId}`);
  revalidatePath("/admin/zahlungen");
  revalidatePath(`/admin/zahlungen/${input.applicationId}`);
  revalidatePath("/verein/bewerbungen");
  revalidatePath(`/verein/bewerbungen/${input.applicationId}`);
  revalidatePath("/teilnahme");

  return { error: null, notice: "Zahlungsstatus gespeichert." };
}

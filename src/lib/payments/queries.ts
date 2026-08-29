import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { toApplicationPayment } from "@/lib/payments/mappers";
import type { ApplicationStatus } from "@/types/application";
import type { AdminPaymentRecord } from "@/types/payment";

const paymentApplicationSelect = `
  id,
  status,
  club_name,
  team_name,
  payment_status,
  participation_fee,
  paid_at,
  tournaments (name, date)
`;

type PaymentApplicationRow = {
  id: string;
  status: ApplicationStatus;
  club_name: string;
  team_name: string;
  payment_status: AdminPaymentRecord["paymentStatus"];
  participation_fee: number | null;
  paid_at: string | null;
  tournaments: { name: string; date: string } | { name: string; date: string }[] | null;
};

function unwrapTournament(
  value: PaymentApplicationRow["tournaments"],
): { name: string; date: string } | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

async function attachPaymentNotes<T extends { id: string }>(
  rows: T[],
): Promise<Array<T & { payment_note?: string | null }>> {
  if (rows.length === 0) {
    return rows;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_payment_admin_notes")
    .select("application_id, payment_note")
    .in(
      "application_id",
      rows.map((row) => row.id),
    );

  if (error || !data) {
    return rows.map((row) => ({ ...row, payment_note: null }));
  }

  const notesByApplicationId = new Map(
    data.map((row) => [row.application_id, row.payment_note]),
  );

  return rows.map((row) => ({
    ...row,
    payment_note: notesByApplicationId.get(row.id) ?? null,
  }));
}

function toAdminPaymentRecord(
  row: PaymentApplicationRow & { payment_note?: string | null },
): AdminPaymentRecord {
  const tournament = unwrapTournament(row.tournaments);

  return {
    applicationId: row.id,
    applicationStatus: row.status,
    clubName: row.club_name,
    teamName: row.team_name,
    tournamentName: tournament?.name ?? "—",
    tournamentDate: tournament?.date ?? "",
    ...toApplicationPayment({
      payment_status: row.payment_status,
      participation_fee: row.participation_fee,
      paid_at: row.paid_at,
      payment_note: row.payment_note ?? null,
    }),
  };
}

export async function listAdminPaymentRecords(): Promise<{
  records: AdminPaymentRecord[];
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(paymentApplicationSelect)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  if (error) {
    return { records: [], ready: !isMissingRelationError(error) };
  }

  const rows = await attachPaymentNotes((data ?? []) as PaymentApplicationRow[]);

  return {
    records: rows.map(toAdminPaymentRecord),
    ready: true,
  };
}

export async function getAdminPaymentRecord(
  applicationId: string,
): Promise<AdminPaymentRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(paymentApplicationSelect)
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const [row] = await attachPaymentNotes([data as PaymentApplicationRow]);
  return toAdminPaymentRecord(row);
}

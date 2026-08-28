import { createClient } from "@/lib/supabase/server";
import { hashSecureAccessToken } from "@/lib/cancellations/tokens";
import { toApplicationPayment } from "@/lib/payments/mappers";
import type { SecureAccessTokenPurpose } from "@/types/cancellation";
import type { ApplicationPayment } from "@/types/payment";

export async function loadExternalParticipationPaymentByToken(input: {
  token: string;
  purpose: SecureAccessTokenPurpose;
}): Promise<ApplicationPayment | null> {
  const supabase = await createClient();
  const tokenHash = hashSecureAccessToken(input.token);

  const { data, error } = await supabase.rpc(
    "get_external_participation_payment_by_token",
    {
      p_token_hash: tokenHash,
      p_purpose: input.purpose,
    },
  );

  if (error || !data?.[0]) {
    return null;
  }

  const row = data[0];

  return toApplicationPayment({
    payment_status: row.payment_status,
    participation_fee: row.participation_fee,
    paid_at: row.paid_at,
    payment_note: null,
  });
}

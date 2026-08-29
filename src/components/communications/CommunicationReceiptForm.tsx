"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmCommunicationReceiptAction } from "@/lib/communications/communication-receipt-actions";
import { formatDateTimeDe } from "@/lib/format";
import type { CommunicationReceiptView } from "@/types/communication";

type CommunicationReceiptFormProps = {
  token: string;
  receipt: CommunicationReceiptView;
};

export function CommunicationReceiptForm({
  token,
  receipt,
}: CommunicationReceiptFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(receipt.confirmedAt);
  const [justConfirmed, setJustConfirmed] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const result = await confirmCommunicationReceiptAction(token);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.confirmedAt) {
      setConfirmedAt(result.confirmedAt);
      if (!result.alreadyConfirmed) {
        setJustConfirmed(true);
      }
    }

    router.refresh();
  }

  const alreadyConfirmed = confirmedAt != null;

  return (
    <div className="mx-auto max-w-2xl border border-line bg-white p-6 sm:p-8">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-brand-yellow uppercase">
        VfL Kirchheim
      </p>
      <p className="mt-2 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        Turnierinformation
      </p>

      <h2 className="mt-4 font-display text-2xl font-bold tracking-wide text-ink uppercase">
        {receipt.subject}
      </h2>

      <pre className="mt-5 whitespace-pre-wrap font-sans text-[14px] leading-6 text-ink">
        {receipt.body}
      </pre>

      <dl className="mt-8 grid gap-4 border-t border-line pt-6 text-[14px] sm:grid-cols-2">
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
            Turnier
          </dt>
          <dd className="mt-1 text-ink">{receipt.tournamentName}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
            Mannschaft
          </dt>
          <dd className="mt-1 text-ink">{receipt.teamName}</dd>
        </div>
      </dl>

      <p className="mt-6 border border-line bg-surface px-4 py-4 text-[13px] leading-6 text-muted">
        Mit dieser Bestätigung bestätigst du ausschließlich, dass du diese Information
        erhalten hast. Sie stellt keine Vertrags-, Teilnahme- oder Zahlungsbestätigung
        dar.
      </p>

      {alreadyConfirmed ? (
        <p className="mt-6 text-[14px] font-semibold text-ink" role="status">
          {justConfirmed
            ? "Vielen Dank. Der Erhalt dieser Information wurde bestätigt."
            : `Der Erhalt dieser Information wurde bereits bestätigt${
                confirmedAt ? ` (${formatDateTimeDe(confirmedAt)})` : ""
              }.`}
        </p>
      ) : (
        <div className="mt-6">
          {error ? (
            <p className="mb-4 text-[14px] text-[#9a2b2b]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-70"
          >
            {submitting ? "Wird bestätigt…" : "Erhalt bestätigen"}
          </button>
        </div>
      )}
    </div>
  );
}

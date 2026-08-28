"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextAreaInput } from "@/components/apply/FormControls";
import { cancellationDeadlineLabel } from "@/lib/cancellations/deadline";
import { submitExternalCancellationRequestAction } from "@/lib/cancellations/actions";
import { formatDateDe } from "@/lib/format";
import type { ParticipationPortalView } from "@/types/cancellation";

type ParticipationPortalFormProps = {
  token: string;
  portal: ParticipationPortalView;
};

export function ParticipationPortalForm({ token, portal }: ParticipationPortalFormProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(portal.hasPendingRequest);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await submitExternalCancellationRequestAction({
      token,
      reason,
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl border border-line bg-white p-6 sm:p-8">
        <dl className="grid gap-4 text-[14px] text-ink sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
              Turnier
            </dt>
            <dd className="mt-1">{portal.tournamentName}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
              Mannschaft
            </dt>
            <dd className="mt-1">{portal.teamName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
              Turnierdatum
            </dt>
            <dd className="mt-1">
              {formatDateDe(portal.tournamentDate)} ·{" "}
              {cancellationDeadlineLabel(portal.tournamentDate)}
            </dd>
          </div>
        </dl>

        {submitted ? (
          <p className="mt-8 border border-line bg-surface px-4 py-3 text-[14px] leading-6 text-ink">
            Absage angefragt – wir prüfen eure Anfrage. Eine Absage ist erst nach
            Bestätigung durch den VfL Kirchheim wirksam.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
            <p className="text-[13px] leading-6 text-muted">
              {portal.isLateRequestWindow
                ? "Weniger als 14 Tage vor Turnierbeginn ist ein triftiger Grund erforderlich."
                : "Bis einschließlich 14 Tage vor Turnierbeginn ist eine reguläre Absageanfrage möglich."}
            </p>
            <div>
              <label
                htmlFor="external-cancellation-reason"
                className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase"
              >
                Absagegrund{portal.isLateRequestWindow ? "" : " (optional)"}
              </label>
              <div className="mt-2">
                <TextAreaInput
                  id="external-cancellation-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Bitte kurz den Grund für die Absage angeben."
                />
              </div>
            </div>
            {error ? (
              <p className="text-[13px] text-[#9a2b2b]" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-70"
            >
              {submitting ? "Wird gesendet…" : "Absageanfrage senden"}
            </button>
          </form>
        )}
      </div>
  );
}

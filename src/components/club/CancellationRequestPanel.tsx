"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { TextAreaInput } from "@/components/apply/FormControls";
import {
  cancellationDeadlineLabel,
  requiresCancellationReason,
} from "@/lib/cancellations/deadline";
import { submitClubCancellationRequestAction } from "@/lib/cancellations/actions";
import { formatDateDe } from "@/lib/format";
import type { ApplicationStatus } from "@/types/application";

type CancellationRequestPanelProps = {
  applicationId: string;
  applicationStatus: ApplicationStatus;
  tournamentName: string;
  teamName: string;
  tournamentDate: string;
  pendingRequest: {
    id: string;
    requestedAt: string;
    isLateRequest: boolean;
  } | null;
};

export function CancellationRequestPanel({
  applicationId,
  applicationStatus,
  tournamentName,
  teamName,
  tournamentDate,
  pendingRequest,
}: CancellationRequestPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (applicationStatus !== "accepted") {
    return null;
  }

  const late = requiresCancellationReason(tournamentDate);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await submitClubCancellationRequestAction({
      applicationId,
      reason,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (pendingRequest) {
    return (
      <div className="border border-line bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Absageanfrage
        </p>
        <p className="mt-3 text-[14px] leading-6 text-ink">
          Absage angefragt – wir prüfen eure Anfrage. Eine Absage ist erst nach
          Bestätigung durch den VfL Kirchheim wirksam.
        </p>
        <p className="mt-2 text-[13px] text-muted">
          Eingegangen am{" "}
          {new Date(pendingRequest.requestedAt).toLocaleString("de-DE")}
          {pendingRequest.isLateRequest ? " · Kurzfristige Anfrage" : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-line bg-white p-5">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        Turnierteilnahme
      </p>
      <p className="mt-3 text-[14px] leading-6 text-muted">
        Ihr könnt eine Absageanfrage stellen. Die Teilnahme wird erst nach
        Bestätigung durch den VfL als abgesagt behandelt.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex h-10 items-center justify-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
      >
        Turnierteilnahme absagen
      </button>

      <ConfirmModal
        open={open}
        title="Turnierteilnahme absagen"
        confirmLabel={submitting ? "Wird gesendet…" : "Absageanfrage senden"}
        onCancel={() => {
          if (!submitting) {
            setOpen(false);
            setError(null);
          }
        }}
        onConfirm={() => {
          void handleSubmit();
        }}
      >
        <div className="grid gap-4 text-left">
          <dl className="grid gap-2 text-[14px] text-ink">
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                Turnier
              </dt>
              <dd>{tournamentName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                Mannschaft
              </dt>
              <dd>{teamName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                Turnierdatum
              </dt>
              <dd>
                {formatDateDe(tournamentDate)} · {cancellationDeadlineLabel(tournamentDate)}
              </dd>
            </div>
          </dl>
          <p className="text-[13px] leading-6 text-muted">
            {late
              ? "Weniger als 14 Tage vor Turnierbeginn ist ein triftiger Grund erforderlich. Die Anfrage wird vom VfL geprüft."
              : "Bis einschließlich 14 Tage vor Turnierbeginn ist eine reguläre Absageanfrage möglich."}
          </p>
          <div>
            <label
              htmlFor="cancellation-reason"
              className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase"
            >
              Absagegrund{late ? "" : " (optional)"}
            </label>
            <div className="mt-2">
              <TextAreaInput
                id="cancellation-reason"
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
        </div>
      </ConfirmModal>
    </div>
  );
}

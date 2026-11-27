"use client";

import type { SchedulePdfDocumentProps } from "@/components/admin/SchedulePdfDocument";
import {
  DRAFT_PDF_STORAGE_PREFIX,
  type DraftSchedulePdfEnvelope,
} from "@/lib/schedule/draft-schedule-pdf";

type DraftSchedulePdfButtonProps = {
  tournamentId: string;
  document: SchedulePdfDocumentProps;
  disabled?: boolean;
  className?: string;
};

export function DraftSchedulePdfButton({
  tournamentId,
  document,
  disabled = false,
  className,
}: DraftSchedulePdfButtonProps) {
  function openDraftPdf() {
    const storageKey = crypto.randomUUID();
    const envelope: DraftSchedulePdfEnvelope = {
      version: 1,
      tournamentId,
      createdAt: new Date().toISOString(),
      document,
    };
    sessionStorage.setItem(`${DRAFT_PDF_STORAGE_PREFIX}${storageKey}`, JSON.stringify(envelope));
    window.open(
      `/admin/turniere/${encodeURIComponent(tournamentId)}/spielplan/pdf?quelle=entwurf&entwurf=${encodeURIComponent(storageKey)}`,
      "_blank",
    );
  }

  return (
    <button type="button" onClick={openDraftPdf} disabled={disabled} className={className}>
      Vorschau als PDF
    </button>
  );
}

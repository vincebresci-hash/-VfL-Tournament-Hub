"use client";

import { useMemo, useSyncExternalStore } from "react";
import { PrintScheduleButton } from "@/components/admin/PrintScheduleButton";
import {
  SchedulePdfDocument,
  type SchedulePdfDocumentProps,
} from "@/components/admin/SchedulePdfDocument";
import {
  DRAFT_PDF_STORAGE_PREFIX,
  isDraftSchedulePdfEnvelope,
} from "@/lib/schedule/draft-schedule-pdf";

type DraftSchedulePdfPageProps = {
  tournamentId: string;
  storageKey: string;
};

const subscribeNoop = () => () => undefined;

export function DraftSchedulePdfPage({ tournamentId, storageKey }: DraftSchedulePdfPageProps) {
  const raw = useSyncExternalStore<string | null | undefined>(
    subscribeNoop,
    () => sessionStorage.getItem(`${DRAFT_PDF_STORAGE_PREFIX}${storageKey}`),
    () => undefined,
  );
  const result = useMemo<{ document: SchedulePdfDocumentProps | null; error: string | null }>(() => {
    if (raw === undefined) {
      return { document: null, error: null };
    }
    if (raw === null) {
      return { document: null, error: "Der Entwurf ist in diesem Browser-Tab nicht mehr verfügbar. Bitte öffne den PDF-Export erneut aus der Spielplanvorschau." };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isDraftSchedulePdfEnvelope(parsed, tournamentId)) {
        return { document: null, error: "Der PDF-Entwurf gehört nicht zu diesem Turnier oder ist ungültig." };
      }
      return { document: parsed.document, error: null };
    } catch {
      return { document: null, error: "Der PDF-Entwurf konnte nicht gelesen werden. Bitte öffne ihn erneut aus der Vorschau." };
    }
  }, [raw, tournamentId]);

  if (result.error) {
    return <p role="alert" style={{ margin: "32px auto", maxWidth: "720px", padding: "20px", color: "#9a2b2b" }}>{result.error}</p>;
  }
  if (!result.document) {
    return <p role="status" style={{ margin: "32px auto", maxWidth: "720px", padding: "20px" }}>Entwurfs-PDF wird vorbereitet…</p>;
  }

  return (
    <>
      <div className="print:hidden" style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
        <PrintScheduleButton />
      </div>
      <div className="pdf-preview-shell" style={{ maxWidth: "1120px", margin: "0 auto", padding: "18px" }}>
        <SchedulePdfDocument {...result.document} draft />
      </div>
    </>
  );
}

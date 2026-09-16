"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminCompactDestructiveButtonClass,
  adminDestructiveButtonClass,
} from "@/components/admin/AdminPanel";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { deleteArchivedCommunicationAction } from "@/lib/communications/actions";
import { cn } from "@/lib/cn";

type CommunicationHardDeleteControlsProps = {
  communicationId: string;
  compact?: boolean;
};

export function CommunicationHardDeleteControls({
  communicationId,
  compact = false,
}: CommunicationHardDeleteControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonClass = compact
    ? adminCompactDestructiveButtonClass
    : adminDestructiveButtonClass;

  function runDelete() {
    setError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await deleteArchivedCommunicationAction(communicationId);

      if (result.error) {
        setError(result.error);
        return;
      }

      const notice = encodeURIComponent(
        result.notice ?? "Nachricht endgültig gelöscht.",
      );
      router.push(`/admin/kommunikation?archive=archived&notice=${notice}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        disabled={pending}
        className={cn(buttonClass, "disabled:cursor-not-allowed")}
      >
        {pending ? "Wird gelöscht…" : "Endgültig löschen"}
      </button>
      {error ? (
        <p className="text-[12px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmModal
        open={confirmOpen}
        title="Nachricht endgültig löschen?"
        confirmLabel="Endgültig löschen"
        cancelLabel="Abbrechen"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runDelete}
      >
        <div className="space-y-2 text-[14px] leading-6 text-muted">
          <p>Die Nachricht wird endgültig gelöscht.</p>
          <p>
            Empfänger- und Versandzuordnungen dieser Nachricht werden entfernt.
          </p>
          <p>Empfangsbestätigungen dieser Nachricht gehen verloren.</p>
          <p className="font-semibold text-ink">
            Dieser Vorgang kann nicht rückgängig gemacht werden.
          </p>
          <p className="text-[13px]">
            Historische E-Mail-Protokolle bleiben erhalten.
          </p>
        </div>
      </ConfirmModal>
    </div>
  );
}

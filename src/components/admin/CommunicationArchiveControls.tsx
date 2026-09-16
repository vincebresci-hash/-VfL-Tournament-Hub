"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminCompactSecondaryButtonClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import {
  archiveCommunicationAction,
  restoreCommunicationAction,
} from "@/lib/communications/actions";
import { cn } from "@/lib/cn";

type CommunicationArchiveControlsProps = {
  communicationId: string;
  archived: boolean;
  sending: boolean;
  compact?: boolean;
};

export function CommunicationArchiveControls({
  communicationId,
  archived,
  sending,
  compact = false,
}: CommunicationArchiveControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const buttonClass = compact
    ? adminCompactSecondaryButtonClass
    : adminSecondaryButtonClass;

  function runAction() {
    setError(null);
    startTransition(async () => {
      const result = archived
        ? await restoreCommunicationAction(communicationId)
        : await archiveCommunicationAction(communicationId);

      if (result.error) {
        setError(result.error);
        return;
      }

      const notice = encodeURIComponent(
        result.notice ?? (archived ? "Nachricht wiederhergestellt." : "Nachricht archiviert."),
      );
      if (archived) {
        router.push(`/admin/kommunikation/${communicationId}?notice=${notice}`);
        router.refresh();
        return;
      }

      router.push(`/admin/kommunikation?archive=archived&notice=${notice}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={runAction}
        disabled={pending || (!archived && sending)}
        title={
          !archived && sending
            ? "Laufende Versände können nicht archiviert werden."
            : undefined
        }
        className={cn(buttonClass, "disabled:cursor-not-allowed")}
      >
        {pending
          ? archived
            ? "Wird wiederhergestellt…"
            : "Wird archiviert…"
          : archived
            ? "Wiederherstellen"
            : "Archivieren"}
      </button>
      {error ? (
        <p className="text-[12px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

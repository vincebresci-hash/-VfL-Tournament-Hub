"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  AdminEmpty,
  adminCardShellClass,
  adminDestructiveButtonClass,
  adminSecondaryButtonClass,
  adminStatusBadgeClass,
} from "@/components/admin/AdminPanel";
import { emailTemplateTypeLabel } from "@/lib/admin";
import { deleteEmailTemplateAction } from "@/lib/db/admin-actions";
import type { EmailTemplate } from "@/types/admin";

type EmailTemplatesBoardProps = {
  templates: EmailTemplate[];
};

export function EmailTemplatesBoard({ templates }: EmailTemplatesBoardProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!pendingId) {
      return;
    }

    const result = await deleteEmailTemplateAction(pendingId);
    if (result.error) {
      setError(result.error);
      setPendingId(null);
      return;
    }

    setPendingId(null);
    router.refresh();
  }

  return (
    <div>
      <p className="mb-5 max-w-2xl text-[14px] leading-6 text-muted">
        Status-Mails nutzen die aktiven Vorlagen. Inaktive Vorlagen werden nicht
        versendet, der Status wird trotzdem gespeichert.
      </p>

      {error ? (
        <p className="mb-4 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      {templates.length === 0 ? (
        <AdminEmpty>Noch keine E-Mail-Vorlagen vorhanden.</AdminEmpty>
      ) : (
        <div className="grid gap-2.5">
          {templates.map((template) => (
            <article
              key={template.id}
              className={`${adminCardShellClass} p-4 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:p-5`}
            >
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-lg">
                  {template.name}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {emailTemplateTypeLabel[template.type]} · {template.subject}
                </p>
                <p
                  className={`mt-2 ${adminStatusBadgeClass} ${
                    template.active
                      ? "bg-[#e8f5ee] text-[#1f6b3f]"
                      : "bg-line/60 text-muted"
                  }`}
                >
                  {template.active ? "Aktiv" : "Inaktiv"}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
                <Link
                  href={`/admin/emails/${template.id}`}
                  className={adminSecondaryButtonClass}
                >
                  Bearbeiten
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingId(template.id)}
                  className={adminDestructiveButtonClass}
                >
                  Löschen
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmModal
        open={pendingId !== null}
        title="Vorlage wirklich löschen?"
        confirmLabel="Löschen"
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}

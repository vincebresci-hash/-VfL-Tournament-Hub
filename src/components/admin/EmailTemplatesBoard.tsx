"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { AdminEmpty } from "@/components/admin/AdminPanel";
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
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[14px] leading-6 text-muted">
          Diese Vorlagen werden für den automatischen Versand über Resend genutzt.
          Betreff und Text unterstützen Platzhalter wie {"{{club_name}}"} oder
          {" {{tournament_name}}"}.
        </p>
        <Link
          href="/admin/emails/neu"
          className="inline-flex h-10 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Neue Vorlage
        </Link>
      </div>

      {error ? (
        <p className="mt-4 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      {templates.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>Noch keine E-Mail-Vorlagen vorhanden.</AdminEmpty>
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {templates.map((template) => (
            <article
              key={template.id}
              className="border border-line bg-white p-5 sm:flex sm:items-start sm:justify-between sm:gap-4"
            >
              <div>
                <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                  {template.name}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {emailTemplateTypeLabel[template.type]} · {template.subject}
                </p>
                <p className="mt-2 text-[12px] font-semibold tracking-[0.08em] uppercase text-muted">
                  {template.active ? "Aktiv" : "Inaktiv"}
                </p>
              </div>
              <div className="mt-4 flex gap-3 sm:mt-0">
                <Link
                  href={`/admin/emails/${template.id}`}
                  className="inline-flex h-10 items-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                >
                  Bearbeiten
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingId(template.id)}
                  className="inline-flex h-10 items-center text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  AdminPageHeader,
  adminCardShellClass,
  adminDestructiveButtonClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import { PartnerLogoEditor } from "@/components/admin/PartnerLogoEditor";
import {
  createPartnerAction,
  deletePartnerAction,
  updatePartnerAction,
} from "@/lib/partners/actions";
import type { Partner, PartnerInput } from "@/types/partner";

type PartnerAdminFormProps = {
  partner?: Partner;
  canManage: boolean;
};

const emptyValues: PartnerInput = {
  name: "",
  websiteUrl: "",
  isActive: true,
  sortOrder: 0,
};

export function PartnerAdminForm({ partner, canManage }: PartnerAdminFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<PartnerInput>(
    partner
      ? {
          name: partner.name,
          websiteUrl: partner.websiteUrl ?? "",
          isActive: partner.isActive,
          sortOrder: partner.sortOrder,
        }
      : emptyValues,
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(partner?.logoUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function update<K extends keyof PartnerInput>(key: K, value: PartnerInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = partner
      ? await updatePartnerAction(partner.id, values)
      : await createPartnerAction(values);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (!partner && "id" in result && result.id) {
      router.push(`/admin/partner/${result.id}`);
      router.refresh();
      return;
    }

    setNotice("Partner gespeichert.");
    router.refresh();
  }

  async function handleDelete() {
    if (!partner || !canManage) {
      return;
    }

    setSubmitting(true);
    const result = await deletePartnerAction(partner.id);
    setSubmitting(false);
    setConfirmDelete(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/admin/partner");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/partner"
        className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
      >
        ← Alle Partner
      </Link>

      <div className="mt-4">
        <AdminPageHeader
          title={partner ? "Partner bearbeiten" : "Partner hinzufügen"}
          description={
            partner
              ? "Name, Website, Status, Reihenfolge und Logo verwalten."
              : "Neuen Partner anlegen. Logo kann danach hochgeladen werden."
          }
        />
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-[#d9b0b0] bg-[#fff5f5] px-3 py-2 text-[13px] text-[#9a2b2b]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-lg border border-line bg-surface/50 px-3 py-2 text-[13px] text-ink">
          {notice}
        </p>
      ) : null}

      <form
        className={`mt-5 grid gap-4 ${adminCardShellClass} p-4 sm:p-5`}
        onSubmit={handleSubmit}
      >
        <Field id="partner-name" label="Partnername *">
          <TextInput
            id="partner-name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            required
            disabled={!canManage || submitting}
            placeholder="z. B. Mosolf"
          />
        </Field>

        <Field id="partner-website" label="Website">
          <TextInput
            id="partner-website"
            value={values.websiteUrl}
            onChange={(event) => update("websiteUrl", event.target.value)}
            disabled={!canManage || submitting}
            placeholder="https://beispiel.de"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="partner-sort" label="Reihenfolge">
            <TextInput
              id="partner-sort"
              type="number"
              value={String(values.sortOrder)}
              onChange={(event) =>
                update("sortOrder", Number(event.target.value || 0))
              }
              disabled={!canManage || submitting}
            />
          </Field>

          <label className="flex items-end gap-3 pb-1 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(event) => update("isActive", event.target.checked)}
              disabled={!canManage || submitting}
              className="h-4 w-4 rounded border-line"
            />
            <span>Aktiv (öffentlich sichtbar)</span>
          </label>
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className={adminPrimaryButtonClass}
            >
              {submitting ? "Speichern…" : partner ? "Speichern" : "Partner anlegen"}
            </button>
            <Link href="/admin/partner" className={adminSecondaryButtonClass}>
              Abbrechen
            </Link>
          </div>
        ) : (
          <p className="text-[13px] text-muted">
            Nur Leserecht — Änderungen erfordern partners.manage.
          </p>
        )}
      </form>

      {partner && canManage ? (
        <div className="mt-5">
          <PartnerLogoEditor
            partnerId={partner.id}
            partnerName={values.name || partner.name}
            logoUrl={logoUrl}
            onDone={(result) => {
              if (result.error) {
                setError(result.error);
                setNotice(null);
                return;
              }
              setError(null);
              setNotice(result.notice);
              if (result.logoUrl !== undefined) {
                setLogoUrl(result.logoUrl);
              }
              router.refresh();
            }}
          />
        </div>
      ) : null}

      {partner && canManage ? (
        <div className={`mt-5 ${adminCardShellClass} p-4 sm:p-5`}>
          <h2 className="font-display text-[15px] font-bold tracking-[0.04em] text-ink uppercase">
            Partner löschen
          </h2>
          <p className="mt-2 text-[13px] leading-5 text-muted">
            Entfernt den Partner dauerhaft von Homepage und Partnerseite.
          </p>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setConfirmDelete(true)}
            className={`${adminDestructiveButtonClass} mt-4`}
          >
            Partner löschen
          </button>
        </div>
      ) : null}

      <ConfirmModal
        open={confirmDelete}
        title="Partner löschen?"
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      >
        {partner ? (
          <p className="text-[14px] leading-6 text-muted">
            „{partner.name}“ wird dauerhaft entfernt.
            {submitting ? " Löschen…" : null}
          </p>
        ) : null}
      </ConfirmModal>
    </div>
  );
}

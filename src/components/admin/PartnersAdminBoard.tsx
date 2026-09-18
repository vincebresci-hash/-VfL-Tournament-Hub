"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AdminEmpty,
  adminCompactDestructiveButtonClass,
  adminCompactSecondaryButtonClass,
  adminMobileCardClass,
  adminStatusBadgeClass,
  adminTableHeaderBarClass,
  adminTableRowHoverClass,
  adminTableShellClass,
  displayValue,
} from "@/components/admin/AdminPanel";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { deletePartnerAction } from "@/lib/partners/actions";
import type { Partner } from "@/types/partner";
import Image from "next/image";

type PartnersAdminBoardProps = {
  partners: Partner[];
  canManage: boolean;
};

function PartnerLogoThumb({ partner }: { partner: Partner }) {
  if (partner.logoUrl) {
    return (
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white p-1">
        <Image
          src={partner.logoUrl}
          alt={`${partner.name} Logo`}
          width={44}
          height={44}
          unoptimized
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-[11px] font-semibold tracking-[0.06em] text-muted uppercase"
    >
      {partner.name.trim().slice(0, 1) || "P"}
    </span>
  );
}

export function PartnersAdminBoard({ partners, canManage }: PartnersAdminBoardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePartnerAction(id);
      setConfirmId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (partners.length === 0) {
    return <AdminEmpty>Noch keine Partner angelegt.</AdminEmpty>;
  }

  const confirmPartner = partners.find((partner) => partner.id === confirmId) ?? null;

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-lg border border-[#d9b0b0] bg-[#fff5f5] px-3 py-2 text-[13px] text-[#9a2b2b]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 lg:hidden">
        {partners.map((partner) => (
          <article key={partner.id} className={adminMobileCardClass}>
            <div className="flex items-start gap-3">
              <PartnerLogoThumb partner={partner} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                  {partner.name}
                </p>
                <p className="mt-1 truncate text-[13px] text-muted">
                  {partner.websiteUrl ? partner.websiteUrl : "Keine Website"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`${adminStatusBadgeClass} ${
                      partner.isActive
                        ? "bg-[#e8f5ee] text-[#1f6b3f]"
                        : "bg-line/60 text-muted"
                    }`}
                  >
                    {partner.isActive ? "Aktiv" : "Inaktiv"}
                  </span>
                  <span className="text-[12px] text-muted">
                    Reihenfolge {partner.sortOrder}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/admin/partner/${partner.id}`}
                className={adminCompactSecondaryButtonClass}
              >
                Bearbeiten
              </Link>
              {canManage ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmId(partner.id)}
                  className={adminCompactDestructiveButtonClass}
                >
                  Löschen
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div className={adminTableShellClass}>
        <div className={`${adminTableHeaderBarClass} grid grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.2fr)_88px_100px_160px] gap-3`}>
          <span>Logo</span>
          <span>Name</span>
          <span>Website</span>
          <span>Status</span>
          <span>Reihenfolge</span>
          <span className="text-right">Aktionen</span>
        </div>
        {partners.map((partner) => (
          <div
            key={partner.id}
            className={`${adminTableRowHoverClass} grid grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.2fr)_88px_100px_160px] items-center gap-3 px-4 py-3`}
          >
            <PartnerLogoThumb partner={partner} />
            <p className="truncate font-medium text-ink">{partner.name}</p>
            <p className="truncate text-[13px] text-muted">
              {displayValue(partner.websiteUrl)}
            </p>
            <span
              className={`${adminStatusBadgeClass} w-fit ${
                partner.isActive
                  ? "bg-[#e8f5ee] text-[#1f6b3f]"
                  : "bg-line/60 text-muted"
              }`}
            >
              {partner.isActive ? "Aktiv" : "Inaktiv"}
            </span>
            <span className="text-[13px] text-ink">{partner.sortOrder}</span>
            <div className="flex justify-end gap-2">
              <Link
                href={`/admin/partner/${partner.id}`}
                className={adminCompactSecondaryButtonClass}
              >
                Bearbeiten
              </Link>
              {canManage ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmId(partner.id)}
                  className={adminCompactDestructiveButtonClass}
                >
                  Löschen
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(confirmPartner)}
        title="Partner löschen?"
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmPartner) {
            handleDelete(confirmPartner.id);
          }
        }}
      >
        {confirmPartner ? (
          <p className="text-[14px] leading-6 text-muted">
            „{confirmPartner.name}“ wird dauerhaft entfernt und erscheint nicht mehr
            auf der Website.
            {pending ? " Löschen…" : null}
          </p>
        ) : null}
      </ConfirmModal>
    </div>
  );
}

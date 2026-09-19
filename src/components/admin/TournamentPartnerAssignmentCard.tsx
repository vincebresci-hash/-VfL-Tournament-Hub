"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSectionTitleClass,
} from "@/components/admin/AdminPanel";
import { setTournamentPartnerAssignmentsAction } from "@/lib/partners/tournament-partner-assignment-actions";
import type { AdminTournamentPartnerAssignmentState } from "@/lib/partners/queries";
import type { Partner } from "@/types/partner";

type TournamentPartnerAssignmentCardProps = {
  tournamentId: string;
  assignmentState: AdminTournamentPartnerAssignmentState;
};

function comparePartners(a: Partner, b: Partner) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  const byName = a.name.localeCompare(b.name, "de");
  if (byName !== 0) {
    return byName;
  }
  return a.id.localeCompare(b.id);
}

export function TournamentPartnerAssignmentCard({
  tournamentId,
  assignmentState,
}: TournamentPartnerAssignmentCardProps) {
  const router = useRouter();
  const { ready, availableActivePartners, inactiveAssignedPartners, assignedPartnerIds } =
    assignmentState;

  const options = useMemo(() => {
    const byId = new Map<string, Partner>();
    for (const partner of availableActivePartners) {
      byId.set(partner.id, partner);
    }
    for (const partner of inactiveAssignedPartners) {
      byId.set(partner.id, partner);
    }
    return Array.from(byId.values()).sort(comparePartners);
  }, [availableActivePartners, inactiveAssignedPartners]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(assignedPartnerIds),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function togglePartner(partnerId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(partnerId)) {
        next.delete(partnerId);
      } else {
        next.add(partnerId);
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) {
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);

    const result = await setTournamentPartnerAssignmentsAction(
      tournamentId,
      Array.from(selectedIds),
    );

    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice("Partner-Zuordnung gespeichert.");
    router.refresh();
  }

  if (!ready) {
    return (
      <section className={`${adminCardShellClass} p-4 sm:p-5`}>
        <h2 className={adminSectionTitleClass}>Partner & Sponsoren</h2>
        <p className="mt-3 text-[14px] leading-6 text-[#9a2b2b]" role="alert">
          Die Partner-Zuordnung konnte nicht geladen werden. Speichern ist
          deaktiviert, damit bestehende Zuordnungen nicht versehentlich gelöscht
          werden.
        </p>
      </section>
    );
  }

  return (
    <section className={`${adminCardShellClass} p-4 sm:p-5`}>
      <h2 className={adminSectionTitleClass}>Partner & Sponsoren</h2>
      <p className="mt-2 text-[14px] leading-6 text-muted">
        Wählen Sie die Partner für dieses Turnier. Inaktive Partner können nur
        behalten oder entfernt werden, wenn sie bereits zugeordnet sind.
      </p>

      {error ? (
        <p
          className={`${adminCardShellClass} mt-4 px-4 py-3.5 text-[14px] text-[#9a2b2b]`}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={`${adminCardShellClass} mt-4 px-4 py-3.5 text-[14px] text-ink`}>
          {notice}
        </p>
      ) : null}

      {options.length === 0 ? (
        <p className="mt-4 text-[14px] leading-6 text-muted">
          Keine Partner verfügbar. Legen Sie zuerst aktive Partner unter Partner
          Management an.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {options.map((partner) => {
              const checked = selectedIds.has(partner.id);
              const inactive = !partner.isActive;
              return (
                <li key={partner.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 sm:px-3.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-line text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                      checked={checked}
                      onChange={() => togglePartner(partner.id)}
                      disabled={pending}
                    />
                    {partner.logoUrl ? (
                      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
                        <Image
                          src={partner.logoUrl}
                          alt=""
                          fill
                          className="object-contain p-0.5"
                          sizes="32px"
                          unoptimized
                        />
                      </span>
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
                        {partner.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {partner.name}
                      </span>
                      {inactive ? (
                        <span className="mt-0.5 inline-flex items-center rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
                          Inaktiv
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className={adminPrimaryButtonClass}
              disabled={pending}
            >
              {pending ? "Speichern…" : "Partner speichern"}
            </button>
            <p className="text-[12px] leading-5 text-muted">
              Leere Auswahl entfernt alle Partner von diesem Turnier.
            </p>
          </div>
        </form>
      )}
    </section>
  );
}

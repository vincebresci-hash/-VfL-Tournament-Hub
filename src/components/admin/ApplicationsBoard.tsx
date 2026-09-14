"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationFiltersPanel } from "@/components/admin/ApplicationFilters";
import { ApplicationTable } from "@/components/admin/ApplicationTable";
import { AdminPageHeader } from "@/components/admin/AdminPanel";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import {
  applicationStatusFilters,
  countByStatus,
  emptyApplicationFilters,
  filterApplications,
  sortApplications,
  type ApplicationFilters,
  type ApplicationSort,
} from "@/lib/admin";
import { toBoardTournament } from "@/lib/tournaments";
import type { AdminTournamentRecord } from "@/types/admin";

type ApplicationsBoardProps = {
  tournaments: AdminTournamentRecord[];
};

export function ApplicationsBoard({ tournaments }: ApplicationsBoardProps) {
  const searchParams = useSearchParams();
  const tournamentFromQuery = searchParams.get("turnier");
  const { applications, databaseReady } = useAdminData();
  const boardTournaments = tournaments.map(toBoardTournament);
  const [filters, setFilters] = useState<ApplicationFilters>(() => ({
    ...emptyApplicationFilters,
    tournamentId: tournamentFromQuery ?? "all",
  }));
  const [sort, setSort] = useState<ApplicationSort>("newest");

  const archiveScopedApplications = useMemo(
    () =>
      applications.filter((application) =>
        filters.archive === "archived"
          ? Boolean(application.archivedAt)
          : !application.archivedAt,
      ),
    [applications, filters.archive],
  );
  const counts = countByStatus(archiveScopedApplications);
  const visible = useMemo(
    () => sortApplications(filterApplications(applications, filters), sort),
    [applications, filters, sort],
  );

  return (
    <div>
      <AdminPageHeader
        title="Bewerbungen"
        description="Bewerbungen prüfen, annehmen und den passenden Turnieren zuordnen."
      />

      {databaseReady ? null : (
        <p className="mt-6 border border-line bg-white px-5 py-4 text-[14px] text-muted">
          Die Datenbank ist derzeit nicht erreichbar. Es werden keine
          Beispielbewerbungen angezeigt.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { id: "active", label: "Aktiv" },
            { id: "archived", label: "Archiviert" },
          ] as const
        ).map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() =>
              setFilters((current) => ({ ...current, archive: filter.id }))
            }
            className={
              filters.archive === filter.id
                ? "border border-navy bg-navy px-3 py-2 text-left text-white"
                : "border border-line bg-white px-3 py-2 text-left"
            }
          >
            <span className="block font-display text-xl font-bold">
              {
                applications.filter((application) =>
                  filter.id === "archived"
                    ? Boolean(application.archivedAt)
                    : !application.archivedAt,
                ).length
              }
            </span>
            <span
              className={
                filters.archive === filter.id
                  ? "mt-1 block text-[10px] font-semibold tracking-[0.1em] uppercase text-white/80"
                  : "mt-1 block text-[10px] font-semibold tracking-[0.1em] text-muted uppercase"
              }
            >
              {filter.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {applicationStatusFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setFilters((current) => ({ ...current, status: filter.id }))}
            className="border border-line bg-white px-3 py-2 text-left"
          >
            <span className="block font-display text-xl font-bold text-ink">
              {counts[filter.id]}
            </span>
            <span className="mt-1 block text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
              {filter.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <ApplicationFiltersPanel
          filters={filters}
          sort={sort}
          tournaments={boardTournaments}
          onChange={setFilters}
          onSortChange={setSort}
        />
      </div>

      <div className="mt-6">
        <ApplicationTable applications={visible} tournaments={boardTournaments} />
      </div>
    </div>
  );
}

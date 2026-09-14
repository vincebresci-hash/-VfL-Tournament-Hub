"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationFiltersPanel } from "@/components/admin/ApplicationFilters";
import { ApplicationTable } from "@/components/admin/ApplicationTable";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
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

  const activeCount = applications.filter((application) => !application.archivedAt).length;
  const archivedCount = applications.filter((application) =>
    Boolean(application.archivedAt),
  ).length;

  return (
    <div>
      <AdminPageHeader
        title="Bewerbungen"
        description="Bewerbungen prüfen, annehmen und den passenden Turnieren zuordnen."
      />

      {databaseReady ? null : (
        <AdminNotice>
          Die Datenbank ist derzeit nicht erreichbar. Es werden keine
          Beispielbewerbungen angezeigt.
        </AdminNotice>
      )}

      <div className="mt-6">
        <ApplicationFiltersPanel
          filters={filters}
          sort={sort}
          tournaments={boardTournaments}
          onChange={setFilters}
          onSortChange={setSort}
        />
      </div>

      <div className="mt-4 border border-line bg-white px-4 py-3">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
          Übersicht ({filters.archive === "archived" ? "Archiviert" : "Aktiv"})
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <div className="min-w-0 border border-line px-3 py-2">
            <p className="font-display text-xl font-bold text-ink">
              {filters.archive === "archived" ? archivedCount : activeCount}
            </p>
            <p className="mt-1 text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
              {filters.archive === "archived" ? "Archiviert" : "Aktiv"}
            </p>
          </div>
          {applicationStatusFilters.map((filter) => (
            <div key={filter.id} className="min-w-0 border border-line px-3 py-2">
              <p className="font-display text-xl font-bold text-ink">{counts[filter.id]}</p>
              <p className="mt-1 truncate text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                {filter.label}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          {visible.length}{" "}
          {visible.length === 1 ? "Bewerbung" : "Bewerbungen"} für die aktuelle Auswahl
        </p>
      </div>

      <div className="mt-6">
        <ApplicationTable applications={visible} tournaments={boardTournaments} />
      </div>
    </div>
  );
}

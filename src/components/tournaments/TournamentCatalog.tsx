"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { TournamentCard } from "@/components/tournaments/TournamentCard";
import { cn } from "@/lib/cn";
import { sortTournaments } from "@/lib/tournaments";
import { AGE_GROUPS, type AgeGroup, type PublicTournament, type TournamentStatus } from "@/types/tournament";

type StatusFilter = "all" | TournamentStatus;

const statusFilters: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "active", label: "Bewerbung offen" },
  { id: "coming-soon", label: "Demnächst" },
  { id: "full", label: "Voll" },
  { id: "completed", label: "Abgeschlossen" },
];

type TournamentCatalogProps = {
  tournaments: PublicTournament[];
  applicationsEnabled?: boolean;
  waitlistEnabled?: boolean;
};

export function TournamentCatalog({
  tournaments,
  applicationsEnabled = true,
  waitlistEnabled = true,
}: TournamentCatalogProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeGroup | "all">("all");

  const visibleTournaments = useMemo(() => {
    return sortTournaments(
      tournaments.filter((tournament) => {
        const statusMatch =
          statusFilter === "all" || tournament.status === statusFilter;
        const ageMatch = ageFilter === "all" || tournament.ageGroup === ageFilter;
        return statusMatch && ageMatch;
      }),
    );
  }, [ageFilter, statusFilter, tournaments]);

  return (
    <div>
      <div className="mt-8 flex flex-col gap-4 border-y border-line py-4 sm:mt-10">
        <FilterGroup label="Status">
          {statusFilters.map((filter) => (
            <FilterChip
              key={filter.id}
              selected={statusFilter === filter.id}
              onClick={() => setStatusFilter(filter.id)}
            >
              {filter.label}
            </FilterChip>
          ))}
        </FilterGroup>

        <div className="flex flex-col gap-3 sm:hidden">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Altersklasse
          </p>
          <label className="sr-only" htmlFor="age-group-filter">
            Altersklasse
          </label>
          <select
            id="age-group-filter"
            value={ageFilter}
            onChange={(event) =>
              setAgeFilter(event.target.value as AgeGroup | "all")
            }
            className="h-11 w-full border border-line bg-white px-3 text-[13px] font-medium tracking-[0.06em] text-ink uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            <option value="all">Alle Jahrgänge</option>
            {AGE_GROUPS.map((ageGroup) => (
              <option key={ageGroup} value={ageGroup}>
                {ageGroup}
              </option>
            ))}
          </select>
        </div>

        <FilterGroup label="Altersklasse" className="hidden sm:flex sm:flex-col">
          <FilterChip
            selected={ageFilter === "all"}
            onClick={() => setAgeFilter("all")}
          >
            Alle Jahrgänge
          </FilterChip>
          {AGE_GROUPS.map((ageGroup) => (
            <FilterChip
              key={ageGroup}
              selected={ageFilter === ageGroup}
              onClick={() => setAgeFilter(ageGroup)}
            >
              {ageGroup}
            </FilterChip>
          ))}
        </FilterGroup>
      </div>

      {visibleTournaments.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {visibleTournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              applicationsEnabled={applicationsEnabled}
              waitlistEnabled={waitlistEnabled}
            />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-sm text-muted">
          Keine Turniere für diese Auswahl.
        </p>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-8 items-center px-3 text-[11px] font-semibold tracking-[0.1em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
        selected
          ? "bg-navy text-white"
          : "border border-line bg-white text-ink hover:border-navy/25 hover:text-navy",
      )}
    >
      {children}
    </button>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  applicationSortOptions,
  applicationStatusFilters,
  clubTypeLabel,
  emptyApplicationFilters,
  type ApplicationFilters,
  type ApplicationSort,
} from "@/lib/admin";
import { AGE_GROUPS, type Tournament } from "@/types/tournament";
import { CLUB_TYPES, TEAM_STRENGTHS } from "@/types/application";

type ApplicationFiltersProps = {
  filters: ApplicationFilters;
  sort: ApplicationSort;
  tournaments: Tournament[];
  onChange: (filters: ApplicationFilters) => void;
  onSortChange: (sort: ApplicationSort) => void;
};

const selectClassName =
  "h-10 w-full border border-line bg-white px-3 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

export function ApplicationFiltersPanel({
  filters,
  sort,
  tournaments,
  onChange,
  onSortChange,
}: ApplicationFiltersProps) {
  function update<K extends keyof ApplicationFilters>(
    key: K,
    value: ApplicationFilters[K],
  ) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {applicationStatusFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => update("status", filter.id)}
            className={cn(
              "h-9 px-3 text-[11px] font-semibold tracking-[0.08em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
              filters.status === filter.id
                ? "bg-navy text-white"
                : "border border-line bg-white text-muted hover:text-ink",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FilterField label="Turnier">
          <select
            value={filters.tournamentId}
            onChange={(event) => update("tournamentId", event.target.value)}
            className={selectClassName}
          >
            <option value="all">Alle Turniere</option>
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Altersklasse">
          <select
            value={filters.ageGroup}
            onChange={(event) =>
              update("ageGroup", event.target.value as ApplicationFilters["ageGroup"])
            }
            className={selectClassName}
          >
            <option value="all">Alle</option>
            {AGE_GROUPS.map((ageGroup) => (
              <option key={ageGroup} value={ageGroup}>
                {ageGroup}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Spielstärke">
          <select
            value={filters.strength === "all" ? "all" : String(filters.strength)}
            onChange={(event) =>
              update(
                "strength",
                event.target.value === "all"
                  ? "all"
                  : (Number(event.target.value) as ApplicationFilters["strength"]),
              )
            }
            className={selectClassName}
          >
            <option value="all">Alle</option>
            {TEAM_STRENGTHS.map((strength) => (
              <option key={strength} value={strength}>
                {strength}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Vereinskategorie">
          <select
            value={filters.clubType}
            onChange={(event) =>
              update("clubType", event.target.value as ApplicationFilters["clubType"])
            }
            className={selectClassName}
          >
            <option value="all">Alle</option>
            {CLUB_TYPES.map((type) => (
              <option key={type} value={type}>
                {clubTypeLabel[type]}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Sortierung">
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as ApplicationSort)}
            className={selectClassName}
          >
            {applicationSortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
      </div>

      <div className="mt-3">
        <label
          htmlFor="application-search"
          className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase"
        >
          Suche
        </label>
        <input
          id="application-search"
          type="search"
          value={filters.query}
          onChange={(event) => update("query", event.target.value)}
          placeholder="Verein oder Mannschaft suchen"
          className={cn(selectClassName, "mt-2")}
        />
      </div>

      <button
        type="button"
        onClick={() => onChange(emptyApplicationFilters)}
        className="mt-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        Filter zurücksetzen
      </button>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
        {label}
      </span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

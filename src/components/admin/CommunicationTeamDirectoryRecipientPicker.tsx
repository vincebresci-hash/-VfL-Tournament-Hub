"use client";

import { useMemo } from "react";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import {
  collectUniqueDirectoryFilterValues,
  filterVisibleDirectoryEntries,
  formatDirectoryContactName,
  isDirectoryEntrySelectable,
  type CommunicationEligibleDirectoryEntry,
  type DirectoryRecipientPickerFilters,
} from "@/lib/communications/team-directory-recipient-picker";

type CommunicationTeamDirectoryRecipientPickerProps = {
  entries: CommunicationEligibleDirectoryEntry[];
  filters: DirectoryRecipientPickerFilters;
  onFiltersChange: (filters: DirectoryRecipientPickerFilters) => void;
  selectedEntryIds: string[];
  onSelectionChange: (entryIds: string[]) => void;
};

export function CommunicationTeamDirectoryRecipientPicker({
  entries,
  filters,
  onFiltersChange,
  selectedEntryIds,
  onSelectionChange,
}: CommunicationTeamDirectoryRecipientPickerProps) {
  const visibleEntries = useMemo(
    () => filterVisibleDirectoryEntries(entries, filters),
    [entries, filters],
  );
  const filterValues = useMemo(
    () => collectUniqueDirectoryFilterValues(entries),
    [entries],
  );
  const selectableVisibleIds = useMemo(
    () =>
      visibleEntries
        .filter((entry) => isDirectoryEntrySelectable(entry))
        .map((entry) => entry.id),
    [visibleEntries],
  );
  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedEntryIds.includes(id));

  function updateFilters(patch: Partial<DirectoryRecipientPickerFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  function toggleEntry(entryId: string) {
    onSelectionChange(
      selectedEntryIds.includes(entryId)
        ? selectedEntryIds.filter((id) => id !== entryId)
        : [...selectedEntryIds, entryId],
    );
  }

  function selectAllVisible() {
    onSelectionChange([...new Set([...selectedEntryIds, ...selectableVisibleIds])]);
  }

  function clearSelection() {
    onSelectionChange([]);
  }

  return (
    <div className="mt-6 border border-line bg-surface px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Team-Datenbank
          </p>
          <p className="mt-1 text-[13px] text-muted">
            CRM-Einträge auswählen. Filter ändern nur die Ansicht, nicht die bestehende Auswahl.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={selectableVisibleIds.length === 0}
            className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:bg-surface disabled:opacity-60"
          >
            Alle sichtbaren auswählen
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedEntryIds.length === 0}
            className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:bg-surface disabled:opacity-60"
          >
            Auswahl aufheben
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field id="directory-filter-search" label="Suche">
          <TextInput
            value={filters.search}
            onChange={(event) => updateFilters({ search: event.target.value })}
            placeholder="Verein, Team, E-Mail …"
          />
        </Field>
        <Field id="directory-filter-club" label="Verein">
          <SelectInput
            value={filters.clubName}
            onChange={(event) => updateFilters({ clubName: event.target.value })}
          >
            <option value="all">Alle</option>
            {filterValues.clubNames.map((clubName) => (
              <option key={clubName} value={clubName}>
                {clubName}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="directory-filter-age-group" label="Altersklasse">
          <SelectInput
            value={filters.ageGroup}
            onChange={(event) => updateFilters({ ageGroup: event.target.value })}
          >
            <option value="all">Alle</option>
            {filterValues.ageGroups.map((ageGroup) => (
              <option key={ageGroup} value={ageGroup}>
                {ageGroup}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="directory-filter-birth-year" label="Jahrgang">
          <SelectInput
            value={filters.birthYear}
            onChange={(event) => updateFilters({ birthYear: event.target.value })}
          >
            <option value="all">Alle</option>
            {filterValues.birthYears.map((birthYear) => (
              <option key={birthYear} value={birthYear}>
                {birthYear}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="directory-filter-league" label="Liga">
          <SelectInput
            value={filters.league}
            onChange={(event) => updateFilters({ league: event.target.value })}
          >
            <option value="all">Alle</option>
            {filterValues.leagues.map((league) => (
              <option key={league} value={league}>
                {league}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="directory-filter-internal-category" label="Interne Kategorie">
          <SelectInput
            value={filters.internalCategory}
            onChange={(event) => updateFilters({ internalCategory: event.target.value })}
          >
            <option value="all">Alle</option>
            {filterValues.internalCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="directory-filter-internal-strength" label="Interne Stärke">
          <SelectInput
            value={filters.internalStrength}
            onChange={(event) => updateFilters({ internalStrength: event.target.value })}
          >
            <option value="all">Alle</option>
            {filterValues.internalStrengths.map((strength) => (
              <option key={strength} value={strength}>
                {strength}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="directory-filter-hub" label="Hub / extern">
          <SelectInput
            value={filters.hub}
            onChange={(event) =>
              updateFilters({
                hub: event.target.value as DirectoryRecipientPickerFilters["hub"],
              })
            }
          >
            <option value="all">Alle</option>
            <option value="hub">Hub-Team</option>
            <option value="external">Extern</option>
          </SelectInput>
        </Field>
      </div>

      <div className="mt-4 overflow-x-auto border border-line bg-white">
        <table className="min-w-full text-left text-[14px]">
          <thead className="border-b border-line bg-surface text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            <tr>
              <th className="px-3 py-3">Auswahl</th>
              <th className="px-3 py-3">Verein</th>
              <th className="px-3 py-3">Mannschaft</th>
              <th className="px-3 py-3">Altersklasse</th>
              <th className="px-3 py-3">Jahrgang</th>
              <th className="px-3 py-3">Liga</th>
              <th className="px-3 py-3">Kategorie</th>
              <th className="px-3 py-3">Stärke</th>
              <th className="px-3 py-3">Ansprechpartner</th>
              <th className="px-3 py-3">E-Mail</th>
              <th className="px-3 py-3">Hub</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-muted">
                  Keine Team-Datenbank-Einträge für die aktuelle Filterauswahl.
                </td>
              </tr>
            ) : (
              visibleEntries.map((entry) => {
                const selectable = isDirectoryEntrySelectable(entry);

                return (
                  <tr key={entry.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.includes(entry.id)}
                        disabled={!selectable}
                        onChange={() => toggleEntry(entry.id)}
                        aria-label={`${entry.teamName} auswählen`}
                      />
                    </td>
                    <td className="px-3 py-3 text-muted">{entry.clubName}</td>
                    <td className="px-3 py-3 text-ink">{entry.teamName}</td>
                    <td className="px-3 py-3 text-muted">{entry.ageGroup ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{entry.birthYear ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{entry.league ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{entry.internalCategory ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{entry.internalStrength ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{formatDirectoryContactName(entry)}</td>
                    <td className="px-3 py-3 text-muted">
                      {entry.contactEmail?.trim() || (
                        <span className="text-[#9a2b2b]">Keine E-Mail</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {entry.isHubLinked ? "Hub" : "Extern"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[13px] text-muted">
        {selectedEntryIds.length} Team
        {selectedEntryIds.length === 1 ? "" : "s"} ausgewählt
        {allVisibleSelected && selectableVisibleIds.length > 0
          ? " · alle sichtbaren Teams markiert"
          : ""}
      </p>
    </div>
  );
}

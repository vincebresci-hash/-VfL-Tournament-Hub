"use client";

import { useMemo } from "react";
import { applicationStatusLabel } from "@/lib/admin";
import {
  collectUniqueAgeGroups,
  filterVisibleRecipientApplications,
  isApplicationSelectableForCommunication,
  type CommunicationEligibleApplication,
  type RecipientPickerFilters,
} from "@/lib/communications/recipient-picker";
import { paymentStatusLabel } from "@/lib/payments/labels";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import { APPLICATION_STATUSES } from "@/types/application";
import type { CommunicationType } from "@/types/communication";

type CommunicationRecipientPickerProps = {
  applications: CommunicationEligibleApplication[];
  communicationType: CommunicationType;
  filters: RecipientPickerFilters;
  onFiltersChange: (filters: RecipientPickerFilters) => void;
  selectedApplicationIds: string[];
  onSelectionChange: (applicationIds: string[]) => void;
  selectionEnabled: boolean;
};

export function CommunicationRecipientPicker({
  applications,
  communicationType,
  filters,
  onFiltersChange,
  selectedApplicationIds,
  onSelectionChange,
  selectionEnabled,
}: CommunicationRecipientPickerProps) {
  const visibleApplications = useMemo(
    () => filterVisibleRecipientApplications(applications, filters),
    [applications, filters],
  );
  const ageGroups = useMemo(() => collectUniqueAgeGroups(applications), [applications]);
  const selectableVisibleIds = useMemo(
    () =>
      visibleApplications
        .filter((application) =>
          isApplicationSelectableForCommunication(application, communicationType),
        )
        .map((application) => application.id),
    [communicationType, visibleApplications],
  );
  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedApplicationIds.includes(id));

  function updateFilters(patch: Partial<RecipientPickerFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  function toggleApplication(applicationId: string) {
    onSelectionChange(
      selectedApplicationIds.includes(applicationId)
        ? selectedApplicationIds.filter((id) => id !== applicationId)
        : [...selectedApplicationIds, applicationId],
    );
  }

  function selectAllVisible() {
    onSelectionChange([
      ...new Set([...selectedApplicationIds, ...selectableVisibleIds]),
    ]);
  }

  function clearSelection() {
    onSelectionChange([]);
  }

  return (
    <div className="mt-6 border border-line bg-surface px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Teams & Empfänger
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {selectionEnabled
              ? "Einzelne Teams auswählen. Filter ändern nur die Ansicht, nicht die bestehende Auswahl."
              : "Vorschau der verfügbaren Bewerbungen. Für eine individuelle Auswahl den Empfängerfilter „Individuelle Auswahl“ wählen."}
          </p>
        </div>
        {selectionEnabled ? (
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
              disabled={selectedApplicationIds.length === 0}
              className="inline-flex h-9 items-center border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:bg-surface disabled:opacity-60"
            >
              Auswahl aufheben
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field id="recipient-filter-status" label="Bewerbungsstatus">
          <SelectInput
            value={filters.status}
            onChange={(event) =>
              updateFilters({
                status: event.target.value as RecipientPickerFilters["status"],
              })
            }
          >
            <option value="all">Alle</option>
            {APPLICATION_STATUSES.filter(
              (status) => status !== "cancelled" && status !== "rejected",
            ).map((status) => (
              <option key={status} value={status}>
                {applicationStatusLabel[status]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="recipient-filter-age-group" label="Altersklasse">
          <SelectInput
            value={filters.ageGroup}
            onChange={(event) => updateFilters({ ageGroup: event.target.value })}
          >
            <option value="all">Alle</option>
            {ageGroups.map((ageGroup) => (
              <option key={ageGroup} value={ageGroup}>
                {ageGroup}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="recipient-filter-hub" label="Hub / extern">
          <SelectInput
            value={filters.hub}
            onChange={(event) =>
              updateFilters({
                hub: event.target.value as RecipientPickerFilters["hub"],
              })
            }
          >
            <option value="all">Alle</option>
            <option value="hub">Hub-Team</option>
            <option value="external">Extern</option>
          </SelectInput>
        </Field>
        <Field id="recipient-filter-payment" label="Zahlungsstatus">
          <SelectInput
            value={filters.payment}
            onChange={(event) =>
              updateFilters({
                payment: event.target.value as RecipientPickerFilters["payment"],
              })
            }
          >
            <option value="all">Alle</option>
            <option value="paid">Bezahlt</option>
            <option value="pending">Offen</option>
          </SelectInput>
        </Field>
        <Field id="recipient-filter-search" label="Suche">
          <TextInput
            value={filters.search}
            onChange={(event) => updateFilters({ search: event.target.value })}
            placeholder="Team oder Verein"
          />
        </Field>
      </div>

      <div className="mt-4 overflow-x-auto border border-line bg-white">
        <table className="min-w-full text-left text-[14px]">
          <thead className="border-b border-line bg-surface text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            <tr>
              {selectionEnabled ? <th className="px-3 py-3">Auswahl</th> : null}
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3">Verein</th>
              <th className="px-3 py-3">Altersklasse</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Hub</th>
              <th className="px-3 py-3">E-Mail</th>
              <th className="px-3 py-3">Zahlung</th>
            </tr>
          </thead>
          <tbody>
            {visibleApplications.length === 0 ? (
              <tr>
                <td
                  colSpan={selectionEnabled ? 8 : 7}
                  className="px-3 py-6 text-center text-muted"
                >
                  Keine Bewerbungen für die aktuelle Filterauswahl.
                </td>
              </tr>
            ) : (
              visibleApplications.map((application) => {
                const selectable = isApplicationSelectableForCommunication(
                  application,
                  communicationType,
                );

                return (
                  <tr key={application.id} className="border-b border-line last:border-b-0">
                    {selectionEnabled ? (
                      <td className="px-3 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedApplicationIds.includes(application.id)}
                          disabled={!selectable}
                          onChange={() => toggleApplication(application.id)}
                          aria-label={`${application.teamName} auswählen`}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-3 text-ink">{application.teamName}</td>
                    <td className="px-3 py-3 text-muted">{application.clubName ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{application.ageGroup ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">
                      {applicationStatusLabel[application.status]}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {application.isHubTeam ? "Ja" : "Nein"}
                    </td>
                    <td className="px-3 py-3 text-muted">{application.contactEmail}</td>
                    <td className="px-3 py-3 text-muted">
                      {application.paymentStatus
                        ? paymentStatusLabel[application.paymentStatus]
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectionEnabled ? (
        <p className="mt-3 text-[13px] text-muted">
          {selectedApplicationIds.length} Team
          {selectedApplicationIds.length === 1 ? "" : "s"} ausgewählt
          {allVisibleSelected && selectableVisibleIds.length > 0
            ? " · alle sichtbaren Teams markiert"
            : ""}
        </p>
      ) : null}
    </div>
  );
}

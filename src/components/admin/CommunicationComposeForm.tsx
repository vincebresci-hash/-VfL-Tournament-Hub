"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Field, SelectInput, TextAreaInput, TextInput } from "@/components/apply/FormControls";
import { AdminCard } from "@/components/admin/AdminPanel";
import { CommunicationRecipientPicker } from "@/components/admin/CommunicationRecipientPicker";
import { CommunicationTeamDirectoryRecipientPicker } from "@/components/admin/CommunicationTeamDirectoryRecipientPicker";
import { CommunicationRecipientPreview } from "@/components/admin/CommunicationRecipientPreview";
import {
  previewCommunicationRecipientsAction,
  sendCommunicationAction,
  loadEligibleCommunicationApplicationsAction,
  loadEligibleCommunicationDirectoryEntriesAction,
} from "@/lib/communications/actions";
import {
  communicationRecipientFilterLabel,
  communicationRecipientSourceLabel,
  communicationTypeLabel,
} from "@/lib/communications/labels";
import {
  allowedCommunicationTypesForSource,
  allowedRecipientFiltersForType,
  defaultRecipientFilterForType,
} from "@/lib/communications/recipient-filters";
import {
  DEFAULT_RECIPIENT_PICKER_FILTERS,
  type RecipientPickerFilters,
} from "@/lib/communications/recipient-picker";
import {
  DEFAULT_DIRECTORY_RECIPIENT_PICKER_FILTERS,
  type DirectoryRecipientPickerFilters,
} from "@/lib/communications/team-directory-recipient-picker";
import { buildCommunicationVariables, stripUnresolvedPlaceholders } from "@/lib/communications/variables";
import { renderEmailTemplate } from "@/lib/email/provider";
import {
  type CommunicationRecipientSource,
  type CommunicationType,
  type CommunicationRecipientFilter,
} from "@/types/communication";
import type { AdminTournamentOption } from "@/types/admin";

type CommunicationComposeFormProps = {
  tournaments: AdminTournamentOption[];
  canSend: boolean;
  canUseTeamDirectorySource: boolean;
};

const defaultBodyByType: Record<CommunicationType, string> = {
  "tournament-info": `Hallo {{contact_first_name}},

hier sind aktuelle Informationen zum {{tournament_name}} für {{team_name}}.

{{tournament_url}}

Sportliche Grüße
VfL Kirchheim`,
  schedule: `Hallo {{contact_first_name}},

der Spielplan für {{tournament_name}} ist verfügbar.

Spielplan: {{schedule_url}}
Live: {{live_url}}
{{meinturnierplan_url}}

Sportliche Grüße
VfL Kirchheim`,
  "important-change": `Hallo {{contact_first_name}},

es gibt eine wichtige Änderung zum {{tournament_name}} für {{team_name}}.

Bitte beachtet die folgenden Informationen.

{{tournament_url}}

Sportliche Grüße
VfL Kirchheim`,
  "payment-reminder": `Hallo {{contact_first_name}},

für {{team_name}} beim {{tournament_name}} steht noch eine offene Startgebühr aus.

Betrag: {{participation_fee}}
Status: {{payment_status_label}}

Bitte begleicht die Zahlung zeitnah.

Sportliche Grüße
VfL Kirchheim`,
  general: `Hallo {{contact_first_name}},

eine Nachricht vom {{tournament_name}} an {{team_name}}:

Sportliche Grüße
VfL Kirchheim`,
};

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CommunicationComposeForm({
  tournaments,
  canSend,
  canUseTeamDirectorySource,
}: CommunicationComposeFormProps) {
  const router = useRouter();
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
  const [recipientSource, setRecipientSource] =
    useState<CommunicationRecipientSource>("tournament-applications");
  const [type, setType] = useState<CommunicationType>("tournament-info");
  const [recipientFilter, setRecipientFilter] = useState<CommunicationRecipientFilter>(
    defaultRecipientFilterForType("tournament-info"),
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(defaultBodyByType["tournament-info"]);
  const [important, setImportant] = useState(false);
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [selectedDirectoryEntryIds, setSelectedDirectoryEntryIds] = useState<string[]>([]);
  const [pickerFilters, setPickerFilters] =
    useState<RecipientPickerFilters>(DEFAULT_RECIPIENT_PICKER_FILTERS);
  const [directoryPickerFilters, setDirectoryPickerFilters] =
    useState<DirectoryRecipientPickerFilters>(DEFAULT_DIRECTORY_RECIPIENT_PICKER_FILTERS);
  const [eligibleApplications, setEligibleApplications] = useState<
    Awaited<ReturnType<typeof loadEligibleCommunicationApplicationsAction>>["applications"]
  >([]);
  const [directoryEntries, setDirectoryEntries] = useState<
    Awaited<ReturnType<typeof loadEligibleCommunicationDirectoryEntriesAction>>["entries"]
  >([]);
  const [previewRecipients, setPreviewRecipients] = useState<
    Awaited<ReturnType<typeof previewCommunicationRecipientsAction>>["recipients"]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(createIdempotencyKey);

  const selectedTournament = tournaments.find((item) => item.id === tournamentId) ?? null;
  const isDirectorySource = recipientSource === "team-directory";
  const allowedTypes = useMemo(
    () => allowedCommunicationTypesForSource(recipientSource),
    [recipientSource],
  );
  const allowedFilters = useMemo(() => allowedRecipientFiltersForType(type), [type]);
  const effectiveRecipientFilter = allowedFilters.includes(recipientFilter)
    ? recipientFilter
    : defaultRecipientFilterForType(type);
  const customSelectionActive = !isDirectorySource && effectiveRecipientFilter === "custom";
  const effectiveType = allowedTypes.includes(type) ? type : allowedTypes[0] ?? "general";

  useEffect(() => {
    if (!tournamentId) {
      return;
    }

    let cancelled = false;
    void loadEligibleCommunicationApplicationsAction(tournamentId).then((result) => {
      if (!cancelled) {
        setEligibleApplications(result.applications);
        setSelectedApplicationIds([]);
        setPickerFilters(DEFAULT_RECIPIENT_PICKER_FILTERS);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  useEffect(() => {
    if (!canUseTeamDirectorySource || !isDirectorySource) {
      return;
    }

    let cancelled = false;
    void loadEligibleCommunicationDirectoryEntriesAction().then((result) => {
      if (!cancelled) {
        setDirectoryEntries(result.entries);
        setSelectedDirectoryEntryIds([]);
        setDirectoryPickerFilters(DEFAULT_DIRECTORY_RECIPIENT_PICKER_FILTERS);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [canUseTeamDirectorySource, isDirectorySource]);

  useEffect(() => {
    if (!tournamentId) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void previewCommunicationRecipientsAction({
        tournamentId,
        type: effectiveType,
        recipientFilter: isDirectorySource ? "custom" : effectiveRecipientFilter,
        recipientSource,
        applicationIds:
          !isDirectorySource && effectiveRecipientFilter === "custom"
            ? selectedApplicationIds
            : undefined,
        teamDirectoryEntryIds: isDirectorySource ? selectedDirectoryEntryIds : undefined,
      }).then((result) => {
        if (cancelled) {
          return;
        }

        setPreviewRecipients(result.error ? [] : result.recipients);
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    tournamentId,
    effectiveType,
    effectiveRecipientFilter,
    recipientSource,
    selectedApplicationIds,
    selectedDirectoryEntryIds,
    isDirectorySource,
  ]);

  function handleTypeChange(nextType: CommunicationType) {
    setType(nextType);
    setRecipientFilter(defaultRecipientFilterForType(nextType));
    setBody(defaultBodyByType[nextType]);
    if (nextType === "important-change") {
      setImportant(true);
    }
  }

  function handleRecipientSourceChange(nextSource: CommunicationRecipientSource) {
    setRecipientSource(nextSource);
    setSelectedApplicationIds([]);
    setSelectedDirectoryEntryIds([]);
    setPickerFilters(DEFAULT_RECIPIENT_PICKER_FILTERS);
    setDirectoryPickerFilters(DEFAULT_DIRECTORY_RECIPIENT_PICKER_FILTERS);

    if (nextSource === "team-directory" && type === "payment-reminder") {
      setType("general");
      setRecipientFilter("custom");
      setBody(defaultBodyByType.general);
    }
  }

  function handleRecipientFilterChange(nextFilter: CommunicationRecipientFilter) {
    setRecipientFilter(nextFilter);
    if (nextFilter !== "custom") {
      setSelectedApplicationIds([]);
    }
  }

  function handleSelectionChange(applicationIds: string[]) {
    setSelectedApplicationIds(applicationIds);
    if (applicationIds.length > 0 && effectiveRecipientFilter !== "custom") {
      setRecipientFilter("custom");
    }
  }

  const previewSample = useMemo(() => {
    const sample = previewRecipients[0];
    const variables = buildCommunicationVariables({
      contactFirstName: sample?.recipientContactFirstName ?? "Team",
      teamName: sample?.recipientTeamName ?? "Mannschaft",
      clubName: sample?.recipientClubName ?? "Verein",
      tournamentName: selectedTournament?.name ?? "Turnier",
      tournamentSlug: selectedTournament?.slug ?? "",
      meinTurnierplanUrl: null,
      participationFee: null,
      paymentStatus: effectiveType === "payment-reminder" ? "pending" : null,
    });

    return {
      subject: stripUnresolvedPlaceholders(renderEmailTemplate(subject, variables)),
      body: stripUnresolvedPlaceholders(renderEmailTemplate(body, variables)),
    };
  }, [body, effectiveType, previewRecipients, selectedTournament, subject]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) {
      setError("Keine Berechtigung zum Versenden.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await sendCommunicationAction({
      tournamentId,
      recipientSource,
      type: effectiveType,
      recipientFilter: isDirectorySource ? "custom" : effectiveRecipientFilter,
      applicationIds:
        !isDirectorySource && effectiveRecipientFilter === "custom"
          ? selectedApplicationIds
          : undefined,
      teamDirectoryEntryIds: isDirectorySource ? selectedDirectoryEntryIds : undefined,
      subject,
      body,
      important,
      requireConfirmation,
      idempotencyKey,
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push(
      result.communicationId
        ? `/admin/kommunikation/${result.communicationId}`
        : "/admin/kommunikation",
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-6">
      <AdminCard title="Turnier & Empfänger">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="communication-tournament" label="Turnier">
            <SelectInput
              value={tournamentId}
              onChange={(event) => setTournamentId(event.target.value)}
            >
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="communication-type" label="Nachrichtentyp">
            <SelectInput
              value={effectiveType}
              onChange={(event) =>
                handleTypeChange(event.target.value as CommunicationType)
              }
            >
              {allowedTypes.map((item) => (
                <option key={item} value={item}>
                  {communicationTypeLabel(item)}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        {canUseTeamDirectorySource ? (
          <div className="mt-6">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              Empfängerquelle
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {(["tournament-applications", "team-directory"] as const).map((source) => (
                <label
                  key={source}
                  className="inline-flex items-center gap-2 border border-line bg-white px-4 py-3 text-[14px] text-ink"
                >
                  <input
                    type="radio"
                    name="communication-recipient-source"
                    checked={recipientSource === source}
                    onChange={() => handleRecipientSourceChange(source)}
                  />
                  {communicationRecipientSourceLabel(source)}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {!isDirectorySource ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="communication-filter" label="Empfängerfilter">
              <SelectInput
                value={effectiveRecipientFilter}
                onChange={(event) =>
                  handleRecipientFilterChange(
                    event.target.value as CommunicationRecipientFilter,
                  )
                }
              >
                {allowedFilters.map((item) => (
                  <option key={item} value={item}>
                    {communicationRecipientFilterLabel(item)}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        ) : null}

        {tournamentId && !isDirectorySource ? (
          <CommunicationRecipientPicker
            applications={eligibleApplications}
            communicationType={effectiveType}
            filters={pickerFilters}
            onFiltersChange={setPickerFilters}
            selectedApplicationIds={selectedApplicationIds}
            onSelectionChange={handleSelectionChange}
            selectionEnabled={customSelectionActive}
          />
        ) : null}

        {tournamentId && isDirectorySource ? (
          <CommunicationTeamDirectoryRecipientPicker
            entries={directoryEntries}
            filters={directoryPickerFilters}
            onFiltersChange={setDirectoryPickerFilters}
            selectedEntryIds={selectedDirectoryEntryIds}
            onSelectionChange={setSelectedDirectoryEntryIds}
          />
        ) : null}

        <CommunicationRecipientPreview
          recipients={previewRecipients}
          selectedTeamCount={
            isDirectorySource
              ? selectedDirectoryEntryIds.length
              : customSelectionActive
                ? selectedApplicationIds.length
                : null
          }
        />
      </AdminCard>

      <AdminCard title="Nachricht">
        <div className="grid gap-4">
          <Field id="communication-subject" label="Betreff">
            <TextInput value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field id="communication-body" label="Nachricht">
            <TextAreaInput
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
            />
          </Field>
          <label className="flex items-center gap-3 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={important}
              onChange={(event) => setImportant(event.target.checked)}
            />
            Wichtige Mitteilung
          </label>
          <label className="flex items-start gap-3 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={requireConfirmation}
              onChange={(event) => setRequireConfirmation(event.target.checked)}
              className="mt-1"
            />
            <span>
              Empfangsbestätigung erforderlich
              <span className="mt-1 block text-[12px] text-muted">
                Empfänger erhalten einen persönlichen Link, über den sie den Erhalt der
                Information bestätigen können.
              </span>
            </span>
          </label>
        </div>
      </AdminCard>

      <AdminCard title="Vorschau (Beispiel)">
        <p className="text-[14px] font-semibold text-ink">{previewSample.subject || "—"}</p>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-[14px] leading-6 text-muted">
          {previewSample.body || "—"}
        </pre>
      </AdminCard>

      {error ? (
        <p className="text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}

      {!canSend ? (
        <p className="text-[14px] text-muted">
          Sie können Empfänger und Vorschau sehen, aber nicht versenden. Dafür ist die
          Berechtigung „Kommunikation senden“ erforderlich.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSend || submitting || previewRecipients.length === 0}
          className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-70"
        >
          {submitting ? "Wird gesendet…" : "Jetzt senden"}
        </button>
        <Link
          href="/admin/kommunikation"
          className="text-[14px] font-semibold text-ink underline decoration-brand-yellow underline-offset-2"
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Field, SelectInput, TextAreaInput, TextInput } from "@/components/apply/FormControls";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { ageGroupImageSrc, slugifyTournamentName } from "@/lib/tournaments";
import { MEIN_TURNIERPLAN_DEFAULT_LABEL, extractNumericMeinTurnierplanTournamentIdFromUrl } from "@/lib/mein-turnierplan";
import {
  archiveTournamentAction,
  createTournamentAction,
  deleteTournamentAction,
  restoreTournamentAction,
  updateTournamentAction,
} from "@/lib/db/admin-actions";
import { AGE_GROUPS, TOURNAMENT_STATUSES } from "@/types/tournament";
import { tournamentStatusLabel } from "@/lib/tournament-status";
import type { AdminTournamentInput, AdminTournamentRecord } from "@/types/admin";

type TournamentAdminFormProps = {
  tournament?: AdminTournamentRecord;
  applicationCount?: number;
};

const emptyValues: AdminTournamentInput = {
  name: "",
  slug: "",
  ageGroup: "U10",
  birthYear: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "Jesinger Allee, Kirchheim unter Teck",
  address: "",
  shortDescription: "",
  description: "",
  maxTeams: "16",
  status: "coming-soon",
  applicationsOpen: true,
  waitlistEnabled: true,
  applicationStart: "",
  applicationDeadline: "",
  imageUrl: ageGroupImageSrc.U10,
  playFormat: "",
  playingTime: "",
  pitchFormat: "",
  entryFee: "",
  travelInfo: "",
  changingRooms: "",
  catering: "",
  teamInfo: "",
  meinTurnierplanEnabled: false,
  meinTurnierplanUrl: "",
  meinTurnierplanLabel: "",
  liveDataSource: "hub",
  meinTurnierplanTournamentId: "",
  meinTurnierplanMatchesWidgetUrl: "",
  meinTurnierplanTableWidgetUrl: "",
  publicScheduleNote: "",
  publicLiveNote: "",
};

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.slice(0, 16);
}

function recordToInput(tournament: AdminTournamentRecord): AdminTournamentInput {
  return {
    name: tournament.name,
    slug: tournament.slug,
    ageGroup: AGE_GROUPS.includes(tournament.ageGroup as (typeof AGE_GROUPS)[number])
      ? tournament.ageGroup
      : "U10",
    birthYear: tournament.birthYear ? String(tournament.birthYear) : "",
    date: tournament.date.slice(0, 10),
    startTime: tournament.startTime ?? "",
    endTime: tournament.endTime ?? "",
    location: tournament.location ?? "",
    address: tournament.address ?? "",
    shortDescription: tournament.shortDescription ?? "",
    description: tournament.description ?? "",
    maxTeams: String(tournament.maxTeams ?? 16),
    status: tournament.status,
    applicationsOpen: tournament.applicationsOpen,
    waitlistEnabled: tournament.waitlistEnabled,
    applicationStart: toDateTimeLocal(tournament.applicationStart),
    applicationDeadline: toDateTimeLocal(tournament.applicationDeadline),
    imageUrl: tournament.imageUrl ?? ageGroupImageSrc.U10,
    playFormat: tournament.playFormat ?? "",
    playingTime: tournament.playingTime ?? "",
    pitchFormat: tournament.pitchFormat ?? "",
    entryFee: tournament.entryFee ?? "",
    travelInfo: tournament.travelInfo ?? "",
    changingRooms: tournament.changingRooms ?? "",
    catering: tournament.catering ?? "",
    teamInfo: tournament.teamInfo ?? "",
    meinTurnierplanEnabled: tournament.meinTurnierplanEnabled,
    meinTurnierplanUrl: tournament.meinTurnierplanUrl ?? "",
    meinTurnierplanLabel: tournament.meinTurnierplanLabel ?? "",
    liveDataSource: tournament.liveDataSource,
    meinTurnierplanTournamentId: tournament.meinTurnierplanTournamentId ?? "",
    meinTurnierplanMatchesWidgetUrl: tournament.meinTurnierplanMatchesWidgetUrl ?? "",
    meinTurnierplanTableWidgetUrl: tournament.meinTurnierplanTableWidgetUrl ?? "",
    publicScheduleNote: tournament.publicScheduleNote ?? "",
    publicLiveNote: tournament.publicLiveNote ?? "",
  };
}

export function TournamentAdminForm({
  tournament,
  applicationCount = 0,
}: TournamentAdminFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<AdminTournamentInput>(
    tournament ? recordToInput(tournament) : emptyValues,
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(tournament));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "restore" | "delete" | null>(null);

  const imageOptions = useMemo(
    () =>
      AGE_GROUPS.map((ageGroup) => ({
        value: ageGroupImageSrc[ageGroup],
        label: `${ageGroup} Bild`,
      })),
    [],
  );

  function update<K extends keyof AdminTournamentInput>(
    key: K,
    value: AdminTournamentInput[K],
  ) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === "name" && !slugTouched) {
        next.slug = slugifyTournamentName(String(value));
      }
      if (key === "ageGroup" && imageOptions.some((option) => option.value === current.imageUrl)) {
        next.imageUrl = ageGroupImageSrc[value as (typeof AGE_GROUPS)[number]] ?? current.imageUrl;
      }
      if (
        key === "meinTurnierplanUrl" &&
        typeof value === "string" &&
        !next.meinTurnierplanTournamentId.trim()
      ) {
        const extracted = extractNumericMeinTurnierplanTournamentIdFromUrl(value);
        if (extracted) {
          next.meinTurnierplanTournamentId = extracted;
        }
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = tournament
      ? await updateTournamentAction(tournament.id, values)
      : await createTournamentAction(values);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (!tournament && "id" in result && result.id) {
      router.push(`/admin/turniere/${result.id}/bearbeiten`);
      router.refresh();
      return;
    }

    setNotice("Turnier gespeichert.");
    router.refresh();
  }

  async function handleArchive() {
    if (!tournament) {
      return;
    }

    setSubmitting(true);
    const result = await archiveTournamentAction(tournament.id);
    setSubmitting(false);
    setConfirm(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/admin/turniere");
    router.refresh();
  }

  async function handleRestore() {
    if (!tournament) {
      return;
    }

    setSubmitting(true);
    const result = await restoreTournamentAction(tournament.id);
    setSubmitting(false);
    setConfirm(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice("Turnier wiederhergestellt.");
    router.refresh();
  }

  async function handleDelete() {
    if (!tournament) {
      return;
    }

    setSubmitting(true);
    const result = await deleteTournamentAction(tournament.id);
    setSubmitting(false);
    setConfirm(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/admin/turniere");
    router.refresh();
  }

  const archived = Boolean(tournament?.archivedAt);

  return (
    <form onSubmit={handleSubmit} className="grid gap-8">
      {error ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="border border-line bg-white px-5 py-4 text-[14px] text-ink">{notice}</p>
      ) : null}

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Stammdaten
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="tournament-name" label="Turniername">
            <TextInput
              id="tournament-name"
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <Field id="tournament-slug" label="Slug" hint="Wird in der öffentlichen URL verwendet.">
            <TextInput
              id="tournament-slug"
              value={values.slug}
              onChange={(event) => {
                setSlugTouched(true);
                update("slug", event.target.value);
              }}
            />
          </Field>
          <Field id="tournament-age" label="Altersklasse">
            <SelectInput
              id="tournament-age"
              value={values.ageGroup}
              onChange={(event) => update("ageGroup", event.target.value)}
            >
              {AGE_GROUPS.map((ageGroup) => (
                <option key={ageGroup} value={ageGroup}>
                  {ageGroup}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="tournament-year" label="Jahrgang" optional>
            <TextInput
              id="tournament-year"
              inputMode="numeric"
              value={values.birthYear}
              onChange={(event) => update("birthYear", event.target.value)}
            />
          </Field>
          <Field id="tournament-date" label="Datum">
            <TextInput
              id="tournament-date"
              type="date"
              value={values.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </Field>
          <Field id="tournament-start" label="Startzeit" optional>
            <TextInput
              id="tournament-start"
              type="time"
              value={values.startTime}
              onChange={(event) => update("startTime", event.target.value)}
            />
          </Field>
          <Field id="tournament-end" label="Geplantes Ende" optional>
            <TextInput
              id="tournament-end"
              type="time"
              value={values.endTime}
              onChange={(event) => update("endTime", event.target.value)}
            />
          </Field>
          <Field id="tournament-location" label="Veranstaltungsort">
            <TextInput
              id="tournament-location"
              value={values.location}
              onChange={(event) => update("location", event.target.value)}
            />
          </Field>
          <Field id="tournament-address" label="Adresse" optional>
            <TextInput
              id="tournament-address"
              value={values.address}
              onChange={(event) => update("address", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Beschreibung
        </h2>
        <div className="mt-5 grid gap-5">
          <Field id="tournament-short" label="Kurzbeschreibung" optional>
            <TextAreaInput
              id="tournament-short"
              rows={3}
              value={values.shortDescription}
              onChange={(event) => update("shortDescription", event.target.value)}
            />
          </Field>
          <Field id="tournament-description" label="Ausführliche Beschreibung" optional>
            <TextAreaInput
              id="tournament-description"
              rows={8}
              value={values.description}
              onChange={(event) => update("description", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Status und Kapazität
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="tournament-max" label="Maximale Teams">
            <TextInput
              id="tournament-max"
              inputMode="numeric"
              value={values.maxTeams}
              onChange={(event) => update("maxTeams", event.target.value)}
            />
          </Field>
          <Field id="tournament-status" label="Turnierstatus">
            <SelectInput
              id="tournament-status"
              value={values.status}
              onChange={(event) =>
                update("status", event.target.value as AdminTournamentInput["status"])
              }
            >
              {TOURNAMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tournamentStatusLabel[status]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="tournament-applications" label="Bewerbungsstatus">
            <SelectInput
              id="tournament-applications"
              value={values.applicationsOpen ? "open" : "closed"}
              onChange={(event) => update("applicationsOpen", event.target.value === "open")}
            >
              <option value="open">Bewerbungen geöffnet</option>
              <option value="closed">Bewerbungen geschlossen</option>
            </SelectInput>
          </Field>
          <label
            htmlFor="tournament-waitlist"
            className="flex items-center justify-between gap-4 border border-line px-4 py-3 sm:mt-7"
          >
            <span className="text-[14px] text-ink">Warteliste erlaubt</span>
            <input
              id="tournament-waitlist"
              type="checkbox"
              checked={values.waitlistEnabled}
              onChange={(event) => update("waitlistEnabled", event.target.checked)}
              className="h-4 w-4 accent-brand-yellow"
            />
          </label>
          <Field id="tournament-app-start" label="Bewerbungsstart" optional>
            <TextInput
              id="tournament-app-start"
              type="datetime-local"
              value={values.applicationStart}
              onChange={(event) => update("applicationStart", event.target.value)}
            />
          </Field>
          <Field id="tournament-deadline" label="Bewerbungsfrist" optional>
            <TextInput
              id="tournament-deadline"
              type="datetime-local"
              value={values.applicationDeadline}
              onChange={(event) => update("applicationDeadline", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Öffentliche Turnierinformationen
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted">
          Diese Felder erscheinen auf der Turnierseite nur, wenn sie ausgefüllt
          sind. Leere Felder werden nicht angezeigt.
        </p>
        <div className="mt-5 grid gap-5">
          <Field id="tournament-play-format" label="Spielmodus" optional>
            <TextAreaInput
              id="tournament-play-format"
              rows={3}
              value={values.playFormat}
              onChange={(event) => update("playFormat", event.target.value)}
            />
          </Field>
          <Field id="tournament-playing-time" label="Spielzeit" optional>
            <TextAreaInput
              id="tournament-playing-time"
              rows={2}
              value={values.playingTime}
              onChange={(event) => update("playingTime", event.target.value)}
            />
          </Field>
          <Field id="tournament-pitch" label="Feld- / Spielform" optional>
            <TextAreaInput
              id="tournament-pitch"
              rows={2}
              value={values.pitchFormat}
              onChange={(event) => update("pitchFormat", event.target.value)}
            />
          </Field>
          <Field id="tournament-fee" label="Startgebühr" optional>
            <TextInput
              id="tournament-fee"
              value={values.entryFee}
              onChange={(event) => update("entryFee", event.target.value)}
            />
          </Field>
          <Field id="tournament-travel" label="Anreise / Parken" optional>
            <TextAreaInput
              id="tournament-travel"
              rows={3}
              value={values.travelInfo}
              onChange={(event) => update("travelInfo", event.target.value)}
            />
          </Field>
          <Field id="tournament-changing" label="Umkleiden" optional>
            <TextAreaInput
              id="tournament-changing"
              rows={2}
              value={values.changingRooms}
              onChange={(event) => update("changingRooms", event.target.value)}
            />
          </Field>
          <Field id="tournament-catering" label="Verpflegung" optional>
            <TextAreaInput
              id="tournament-catering"
              rows={2}
              value={values.catering}
              onChange={(event) => update("catering", event.target.value)}
            />
          </Field>
          <Field id="tournament-team-info" label="Hinweise für Mannschaften" optional>
            <TextAreaInput
              id="tournament-team-info"
              rows={4}
              value={values.teamInfo}
              onChange={(event) => update("teamInfo", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          MeinTurnierplan
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted">
          Optionaler externer Live-Spielplan für den Spieltag. Es findet keine
          automatische Synchronisation mit dem internen Spielplan statt.
        </p>
        <div className="mt-5 grid gap-5">
          <label
            htmlFor="tournament-mtp-enabled"
            className="flex items-center justify-between gap-4 border border-line px-4 py-3"
          >
            <span className="text-[14px] text-ink">MeinTurnierplan verwenden</span>
            <input
              id="tournament-mtp-enabled"
              type="checkbox"
              checked={values.meinTurnierplanEnabled}
              onChange={(event) =>
                update("meinTurnierplanEnabled", event.target.checked)
              }
              className="h-4 w-4 accent-brand-yellow"
            />
          </label>
          <Field id="tournament-mtp-source" label="Datenquelle">
            <SelectInput
              id="tournament-mtp-source"
              value={values.liveDataSource}
              onChange={(event) =>
                update(
                  "liveDataSource",
                  event.target.value as AdminTournamentInput["liveDataSource"],
                )
              }
            >
              <option value="hub">Eigener Hub</option>
              <option value="mein-turnierplan">MeinTurnierplan</option>
              <option value="hybrid">Hybrid</option>
            </SelectInput>
          </Field>
          <Field
            id="tournament-mtp-url"
            label="MeinTurnierplan Präsentations-Link"
            hint="Öffentlicher Link zu deinem Turnier bei MeinTurnierplan. Die darin enthaltene öffentliche ID kann von der numerischen Turnier-ID abweichen. Enthält der Link einen rein numerischen id-Parameter (z. B. showit.php?id=1234567890), wird er optional ins Turnier-ID-Feld übernommen."
          >
            <TextInput
              id="tournament-mtp-url"
              inputMode="url"
              value={values.meinTurnierplanUrl}
              onChange={(event) => update("meinTurnierplanUrl", event.target.value)}
            />
          </Field>
          <Field
            id="tournament-mtp-tournament-id"
            label="MeinTurnierplan Turnier-ID"
            hint="Numerische Turnier-ID aus dem eingeloggten MeinTurnierplan-Administrationsbereich. Sie wird für Verbindung prüfen sowie Gruppen & Teams laden verwendet."
          >
            <TextInput
              id="tournament-mtp-tournament-id"
              inputMode="numeric"
              pattern="[0-9]*"
              value={values.meinTurnierplanTournamentId}
              onChange={(event) =>
                update(
                  "meinTurnierplanTournamentId",
                  event.target.value.replace(/\D/g, "").slice(0, 20),
                )
              }
            />
          </Field>
          <Field
            id="tournament-mtp-matches-widget"
            label="Widget-URL Spielplan"
            optional
            hint="Offizielle URL von displayMatches.php auf meinturnierplan.de. Der id-Parameter kann alphanumerisch sein und ist getrennt von der numerischen Turnier-ID."
          >
            <TextInput
              id="tournament-mtp-matches-widget"
              inputMode="url"
              value={values.meinTurnierplanMatchesWidgetUrl}
              onChange={(event) =>
                update("meinTurnierplanMatchesWidgetUrl", event.target.value)
              }
            />
          </Field>
          <Field
            id="tournament-mtp-table-widget"
            label="Widget-URL Tabelle"
            optional
            hint="Offizielle URL von displayTable.php auf meinturnierplan.de. Der id-Parameter kann alphanumerisch sein und ist getrennt von der numerischen Turnier-ID."
          >
            <TextInput
              id="tournament-mtp-table-widget"
              inputMode="url"
              value={values.meinTurnierplanTableWidgetUrl}
              onChange={(event) =>
                update("meinTurnierplanTableWidgetUrl", event.target.value)
              }
            />
          </Field>
          <Field
            id="tournament-mtp-label"
            label="Button-Beschriftung"
            optional
            hint={`Standard bei leerem Feld: ${MEIN_TURNIERPLAN_DEFAULT_LABEL} bzw. phasenabhängige Texte auf der Turnierseite.`}
          >
            <TextInput
              id="tournament-mtp-label"
              value={values.meinTurnierplanLabel}
              placeholder={MEIN_TURNIERPLAN_DEFAULT_LABEL}
              onChange={(event) => update("meinTurnierplanLabel", event.target.value)}
            />
          </Field>
          <Field
            id="tournament-public-schedule-note"
            label="Öffentlicher Spielplan-Hinweis"
            optional
          >
            <TextAreaInput
              id="tournament-public-schedule-note"
              rows={3}
              value={values.publicScheduleNote}
              onChange={(event) => update("publicScheduleNote", event.target.value)}
            />
          </Field>
          <Field id="tournament-public-live-note" label="Öffentlicher Live-Hinweis" optional>
            <TextAreaInput
              id="tournament-public-live-note"
              rows={3}
              value={values.publicLiveNote}
              onChange={(event) => update("publicLiveNote", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Hero-/Turnierbild
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="tournament-image-preset" label="Vorhandenes Bild">
            <SelectInput
              id="tournament-image-preset"
              value={
                imageOptions.some((option) => option.value === values.imageUrl)
                  ? values.imageUrl
                  : "custom"
              }
              onChange={(event) => {
                if (event.target.value !== "custom") {
                  update("imageUrl", event.target.value);
                }
              }}
            >
              {imageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Eigene Bild-URL</option>
            </SelectInput>
          </Field>
          <Field
            id="tournament-image"
            label="Bild-URL"
            hint="Lokale Dateien wie /u10.webp oder eine öffentliche URL."
          >
            <TextInput
              id="tournament-image"
              value={values.imageUrl}
              onChange={(event) => update("imageUrl", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-70"
        >
          {submitting ? "Wird gespeichert…" : tournament ? "Änderungen speichern" : "Turnier anlegen"}
        </button>
        {tournament ? (
          <Link
            href={`/admin/turniere/${tournament.id}`}
            className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20"
          >
            Teilnehmer
          </Link>
        ) : null}
      </div>

      {tournament ? (
        <section className="border border-line bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Archivieren / Löschen
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted">
            Turniere mit Bewerbungen werden nicht hart gelöscht. Archivierte Turniere bleiben
            im Adminbereich sichtbar, erscheinen aber nicht mehr öffentlich.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {archived ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirm("restore")}
                className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
              >
                Wiederherstellen
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirm("archive")}
                className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
              >
                Archivieren
              </button>
            )}
            <button
              type="button"
              disabled={submitting || applicationCount > 0}
              onClick={() => setConfirm("delete")}
              className="inline-flex h-11 items-center px-4 text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase disabled:opacity-40"
            >
              Löschen
            </button>
          </div>
          {applicationCount > 0 ? (
            <p className="mt-3 text-[13px] text-muted">
              {applicationCount} Bewerbung(en) vorhanden — Löschen ist deaktiviert.
            </p>
          ) : null}
        </section>
      ) : null}

      <ConfirmModal
        open={confirm === "archive"}
        title="Turnier wirklich archivieren?"
        confirmLabel="Archivieren"
        onConfirm={() => void handleArchive()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === "restore"}
        title="Turnier wirklich wiederherstellen?"
        confirmLabel="Wiederherstellen"
        onConfirm={() => void handleRestore()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === "delete"}
        title="Turnier wirklich unwiderruflich löschen?"
        confirmLabel="Löschen"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirm(null)}
      />
    </form>
  );
}

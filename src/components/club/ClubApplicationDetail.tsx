import { ClubStatusBadge } from "@/components/club/ClubStatusBadge";
import { clubTypeLabel } from "@/lib/admin";
import { formatDateDe, formatDateTimeDe } from "@/lib/format";
import type { ClubApplicationView } from "@/types/club";

type ClubApplicationDetailProps = {
  application: ClubApplicationView;
};

export function ClubApplicationDetail({ application }: ClubApplicationDetailProps) {
  const accepted = application.applicationStatus === "accepted";

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Bewerbung
      </h1>
      <p className="mt-2 text-[15px] text-muted">{application.tournamentName}</p>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="border border-line bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Eingereichte Angaben
          </h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail term="Turnier" value={application.tournamentName} />
            <Detail term="Datum" value={formatDateDe(application.tournamentDate)} />
            <Detail term="Ort" value={application.tournamentLocation} />
            <Detail term="Mannschaft" value={application.teamName} />
            <Detail term="Altersklasse" value={application.ageGroup} />
            <Detail
              term="Bewerbungsdatum"
              value={formatDateTimeDe(application.createdAt)}
            />
            <Detail term="Jahrgang" value={String(application.birthYear)} />
            <Detail term="Liga" value={application.league} />
            {application.division ? (
              <Detail term="Staffel" value={application.division} />
            ) : null}
            <Detail
              term="Spielstärke Selbsteinschätzung"
              value={`${application.selfRatedStrength} / 5`}
            />
            <Detail
              term="Vereinsart"
              value={application.clubType ? clubTypeLabel[application.clubType] : "–"}
            />
            <Detail
              term="Ansprechpartner"
              value={`${application.contactFirstName} ${application.contactLastName}`}
            />
            <Detail term="Funktion" value={application.contactRole} />
            <Detail term="E-Mail" value={application.contactEmail} />
            <Detail term="Telefon" value={application.contactPhone} />
          </dl>
          {application.teamDescription ? (
            <p className="mt-6 text-[14px] leading-7 text-muted">
              {application.teamDescription}
            </p>
          ) : null}
        </section>

        <aside className="grid gap-4 self-start">
          <div className="border border-line bg-white p-5">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              Aktueller Status
            </p>
            <div className="mt-3">
              <ClubStatusBadge status={application.applicationStatus} />
            </div>
          </div>

          {accepted ? (
            <div className="border border-navy bg-navy p-5 text-white">
              <p className="font-display text-lg font-bold tracking-wide uppercase">
                Teilnahme bestätigt
              </p>
              <p className="mt-3 text-[14px] leading-6 text-white/70">
                Turnierinformationen, Treffpunkt, Spielplan, Dokumente und
                organisatorische Hinweise erscheinen hier, sobald sie freigegeben
                sind.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {term}
      </dt>
      <dd className="mt-1 text-[14px] text-ink">{value}</dd>
    </div>
  );
}

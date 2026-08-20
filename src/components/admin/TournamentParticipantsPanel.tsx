import Link from "next/link";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import { internalCategoryLabel } from "@/lib/admin";
import type { AdminApplication } from "@/types/application";

type TournamentParticipantsPanelProps = {
  participants: AdminApplication[];
};

export function TournamentParticipantsPanel({
  participants,
}: TournamentParticipantsPanelProps) {
  return (
    <AdminCard title="Teilnehmerfeld">
      {participants.length === 0 ? (
        <p className="text-[14px] text-muted">
          Noch keine angenommenen Bewerbungen. Angenommene Teams gelten automatisch als
          Teilnehmer.
        </p>
      ) : (
        <div className="grid gap-3">
          {participants.map((application) => (
            <article key={application.id} className="border border-line p-4">
              <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                {application.clubName}
              </p>
              <p className="mt-1 text-[14px] text-ink">{application.teamName}</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AdminInfo label="Verein" value={application.clubName} />
                <AdminInfo label="Team" value={application.teamName} />
                <AdminInfo label="Altersklasse" value={application.ageGroup} />
                <AdminInfo label="Jahrgang" value={String(application.birthYear)} />
                <AdminInfo label="Spielstärke" value={String(application.selfRatedStrength)} />
                <AdminInfo
                  label="Interne Kategorie"
                  value={
                    application.internalCategory
                      ? internalCategoryLabel[application.internalCategory]
                      : "—"
                  }
                />
                <AdminInfo
                  label="Ansprechpartner"
                  value={displayValue(
                    `${application.contactFirstName} ${application.contactLastName}`.trim(),
                  )}
                />
              </dl>
              <Link
                href={`/admin/bewerbungen/${application.id}`}
                className="mt-4 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
              >
                Bewerbung öffnen →
              </Link>
            </article>
          ))}
        </div>
      )}
    </AdminCard>
  );
}

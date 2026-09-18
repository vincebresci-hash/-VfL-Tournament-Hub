import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { GuestCancellationRecoveryForm } from "@/components/cancellation/GuestCancellationRecoveryForm";
import { listPublicTournaments } from "@/lib/db/tournament-queries";
import { formatDateDe } from "@/lib/format";
import { withCanonical } from "@/lib/site";

export const metadata: Metadata = withCanonical("/kontakt/absage", {
  title: "Teilnahme absagen",
});

export const dynamic = "force-dynamic";

export default async function KontaktAbsagePage() {
  const tournaments = await listPublicTournaments();
  const options = tournaments.map((tournament) => ({
    id: tournament.id,
    label: `${tournament.name} · ${formatDateDe(tournament.date)}`,
  }));

  return (
    <ContentPage
      title="Teilnahme absagen"
      description={
        <>
          Hier könnt ihr einen neuen sicheren Zugangslink zu eurer Teilnahme
          anfordern.
        </>
      }
    >
      <nav aria-label="Brotkrumen" className="mb-8 text-[13px] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link
              href="/kontakt"
              className="underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
            >
              Kontakt
            </Link>
          </li>
          <li aria-hidden="true">→</li>
          <li className="text-ink">Teilnahme absagen</li>
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="relative border border-line bg-white p-6 sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Zugang wiederherstellen
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-wide text-ink uppercase">
            Absage anfragen
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">
            Gebt die Daten eurer Bewerbung ein. Wenn wir eine passende
            Teilnahme zuordnen können, senden wir einen persönlichen Link an
            die hinterlegte Bewerbungs-E-Mail.
          </p>

          <div className="mt-8">
            <GuestCancellationRecoveryForm tournaments={options} />
          </div>
        </section>

        <aside className="grid gap-4 self-start">
          <div className="border border-line bg-white p-6">
            <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Wichtig
            </p>
            <p className="mt-3 text-[15px] leading-7 text-ink">
              Eine Anfrage über dieses Formular storniert eure Teilnahme noch
              nicht.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-[14px] leading-6 text-muted">
              <li>Daten der Bewerbung eingeben</li>
              <li>sicheren Link per E-Mail erhalten</li>
              <li>Absage über den persönlichen Teilnahme-Link anfragen</li>
              <li>VfL Kirchheim prüft die Anfrage</li>
            </ol>
            <p className="mt-5 text-[14px] leading-6 text-ink">
              Die Absage ist erst gültig, nachdem sie vom VfL Kirchheim
              bestätigt wurde.
            </p>
            <p className="mt-3 text-[14px] leading-6 text-muted">
              Bei einer Absage weniger als 14 Tage vor dem Turnier ist eine
              Begründung erforderlich.
            </p>
          </div>

          <div className="border border-line bg-background p-6">
            <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Vereinskonto
            </p>
            <p className="mt-3 text-[14px] leading-6 text-muted">
              Wenn ihr ein Vereinskonto nutzt, stellt die Absageanfrage bitte
              direkt über eure Bewerbungen.
            </p>
            <Link
              href="/verein/bewerbungen"
              className="mt-5 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
            >
              Zu meinen Bewerbungen
            </Link>
          </div>

          <div className="border border-line bg-white p-6">
            <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Zurück
            </p>
            <p className="mt-3 text-[14px] leading-6 text-muted">
              Weitere Hinweise findet ihr auf der Kontaktseite.
            </p>
            <Link
              href="/kontakt"
              className="mt-5 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
            >
              Zur Kontaktseite →
            </Link>
          </div>
        </aside>
      </div>
    </ContentPage>
  );
}

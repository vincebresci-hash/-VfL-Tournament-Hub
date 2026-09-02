import type { Metadata } from "next";
import Link from "next/link";
import { ExistingParticipationLinkForm } from "@/components/cancellation/ExistingParticipationLinkForm";
import { ParticipationRecoveryForm } from "@/components/cancellation/ParticipationRecoveryForm";
import { ContentPage } from "@/components/layout/ContentPage";
import { listPublicTournaments } from "@/lib/db/tournament-queries";
import { withCanonical } from "@/lib/site";

export const metadata: Metadata = withCanonical("/kontakt/absage", {
  title: "Teilnahme absagen",
});

export default async function KontaktAbsagePage() {
  const tournaments = await listPublicTournaments();
  const tournamentOptions = tournaments.map((tournament) => ({
    id: tournament.id,
    name: tournament.name,
    date: tournament.date,
  }));

  return (
    <ContentPage
      title="Teilnahme absagen"
      description="Stellt eine Absageanfrage für eure Turnierteilnahme. Die Absage wird erst nach Bestätigung durch den VfL wirksam."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border border-line bg-white p-6 sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Team mit Vereinskonto
          </p>
          <h2 className="mt-3 font-display text-xl font-bold tracking-wide text-ink uppercase">
            Über das Vereinskonto
          </h2>
          <p className="mt-3 text-[14px] leading-6 text-muted">
            Wenn eure Bewerbung über ein Vereinskonto im Tournament Hub läuft,
            stellt die Absageanfrage direkt in euren Bewerbungen.
          </p>
          <Link
            href="/login?redirect=%2Fverein%2Fbewerbungen"
            className="mt-6 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
          >
            Zum Vereins-Login
          </Link>
        </section>

        <section className="border border-navy bg-navy p-6 text-white sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-white/60 uppercase">
            Externes Team / Gastbewerbung
          </p>
          <h2 className="mt-3 font-display text-xl font-bold tracking-wide uppercase">
            Sicheren Link anfordern
          </h2>
          <p className="mt-3 text-[14px] leading-6 text-white/70">
            Gebt Turnier und Kontakt-E-Mail eurer Gastbewerbung ein. Wir senden
            euch einen sicheren Link zur Teilnahmeverwaltung.
          </p>
          <p className="mt-3 text-[13px] leading-5 text-white/60">
            Bei kurzfristigen Absagen unter 14 Tagen ist ein Grund erforderlich.
          </p>
          <div className="mt-6 border border-white/15 bg-white p-5 text-ink">
            <ParticipationRecoveryForm tournaments={tournamentOptions} />
          </div>
        </section>
      </div>

      <section className="mt-6 border border-line bg-white p-6 sm:p-8">
        <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Ich habe bereits einen Teilnahme-Link
        </p>
        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted">
          Wenn ihr den Link aus einer früheren E-Mail noch habt, könnt ihr ihn
          hier einfügen und direkt zur Teilnahmeverwaltung wechseln.
        </p>
        <div className="mt-5 max-w-xl">
          <ExistingParticipationLinkForm />
        </div>
      </section>
    </ContentPage>
  );
}

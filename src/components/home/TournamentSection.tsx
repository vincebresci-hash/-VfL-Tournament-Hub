import Link from "next/link";
import { TournamentCard } from "@/components/tournaments/TournamentCard";
import { Container } from "@/components/layout/Container";
import { getFeaturedTournaments } from "@/lib/db/tournament-queries";
import { getAppSettings } from "@/lib/settings";

export async function TournamentSection() {
  const [featuredTournaments, settings] = await Promise.all([
    getFeaturedTournaments(),
    getAppSettings(),
  ]);

  return (
    <section className="bg-background pt-12 pb-8 sm:pt-14 lg:pt-16 lg:pb-8" aria-labelledby="aktuelle-turniere">
      <Container>
        <div className="mb-7 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="aktuelle-turniere"
            className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-[2rem]"
          >
            Aktuelle Turniere
          </h2>
          <Link
            href="/turniere"
            className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            Alle Turniere ansehen →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featuredTournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              applicationsEnabled={settings.applicationsEnabled}
              waitlistEnabled={settings.waitlistEnabled}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}

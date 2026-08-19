import type { Metadata } from "next";
import { TournamentCatalog } from "@/components/tournaments/TournamentCatalog";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Container } from "@/components/layout/Container";
import { getPublicTournaments } from "@/lib/tournaments";

export const metadata: Metadata = {
  title: "Turniere",
};

export default function TurnierePage() {
  const tournaments = getPublicTournaments();

  return (
    <div className="flex min-h-full flex-col">
      <Header variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="py-12 sm:py-16 lg:py-20">
          <h1 className="font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
            Turniere
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Unsere Jugendturniere im Überblick.
          </p>
          <TournamentCatalog tournaments={tournaments} />
        </Container>
      </main>
      <Footer />
    </div>
  );
}

import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/home/Hero";
import { InfoSection } from "@/components/home/InfoSection";
import { PartnersSection } from "@/components/home/PartnersSection";
import { StatsSection } from "@/components/home/StatsSection";
import { TournamentSection } from "@/components/home/TournamentSection";
import { Container } from "@/components/layout/Container";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <Hero />
      <main id="inhalt">
        <TournamentSection />
        <InfoSection />
        <section className="bg-navy py-10 sm:py-12" aria-label="Kennzahlen und Partner">
          <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,0.5fr)] lg:gap-8">
            <StatsSection />
            <PartnersSection />
          </Container>
        </section>
      </main>
      <Footer />
    </div>
  );
}

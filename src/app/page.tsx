import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/home/Hero";
import { InfoSection } from "@/components/home/InfoSection";
import { PartnersSection } from "@/components/home/PartnersSection";
import { TournamentSection } from "@/components/home/TournamentSection";
import { Container } from "@/components/layout/Container";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <Hero />
      <main id="inhalt">
        <TournamentSection />
        <InfoSection />
        <section className="bg-navy py-10 sm:py-12" aria-label="Partner">
          <Container>
            <PartnersSection />
          </Container>
        </section>
      </main>
      <Footer />
    </div>
  );
}

import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/home/Hero";
import { InfoSection } from "@/components/home/InfoSection";
import { TournamentSection } from "@/components/home/TournamentSection";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <Hero />
      <main id="inhalt">
        <TournamentSection />
        <InfoSection />
      </main>
      <Footer />
    </div>
  );
}

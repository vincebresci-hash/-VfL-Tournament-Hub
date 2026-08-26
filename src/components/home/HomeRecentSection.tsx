import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { LIVE_TYPO } from "@/lib/live/match-center";
import { formatDateDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { PublicTournament } from "@/types/tournament";

type HomeRecentSectionProps = {
  tournament: PublicTournament | null;
};

export function HomeRecentSection({ tournament }: HomeRecentSectionProps) {
  if (!tournament) {
    return null;
  }

  return (
    <section className="border-y border-line bg-white py-10 sm:py-12" aria-labelledby="zuletzt-beim-vfl">
      <Container>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
          <div className="min-w-0">
            <h2 id="zuletzt-beim-vfl" className={LIVE_TYPO.section}>
              Zuletzt beim VfL
            </h2>
            <p className="mt-3 font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
              {tournament.name}
            </p>
            <p className={cn(LIVE_TYPO.meta, "mt-2")}>
              {[tournament.ageGroup, formatDateDe(tournament.date)]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <span className={cn(LIVE_TYPO.badge, "mt-4 bg-surface text-muted")}>
              Beendet
            </span>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Link
              href={`/turniere/${tournament.slug}`}
              className="inline-flex h-11 items-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              Ergebnisse
            </Link>
            <Link
              href="/turniere"
              className="inline-flex h-11 items-center border border-line px-5 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              Alle Turniere
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

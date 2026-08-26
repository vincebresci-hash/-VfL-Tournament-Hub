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
    <section
      className="border-y border-line bg-white py-8 sm:py-10"
      aria-labelledby="zuletzt-beim-vfl"
    >
      <Container>
        <div className="grid gap-5 border border-line bg-surface/60 p-5 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="zuletzt-beim-vfl" className={LIVE_TYPO.section}>
                Zuletzt beim VfL
              </h2>
              <span className={cn(LIVE_TYPO.badge, "bg-white text-muted ring-1 ring-line")}>
                Beendet
              </span>
            </div>
            <p className="mt-2.5 font-display text-xl font-bold tracking-wide text-ink uppercase break-words sm:text-2xl lg:text-3xl">
              {tournament.name}
            </p>
            <p className={cn(LIVE_TYPO.meta, "mt-1.5")}>
              {[tournament.ageGroup, formatDateDe(tournament.date)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Link
              href={`/turniere/${tournament.slug}`}
              className="inline-flex h-11 items-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              Ergebnisse →
            </Link>
            <Link
              href="/turniere"
              className="inline-flex h-11 items-center border border-line bg-white px-5 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              Alle Turniere
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { LIVE_TYPO } from "@/lib/live/match-center";

export function HomeClubsTeaser() {
  return (
    <section className="bg-surface py-10 sm:py-12" aria-labelledby="mit-eurem-team">
      <Container>
        <div className="grid gap-5 border border-line bg-white p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:p-6 lg:p-7">
          <div className="min-w-0">
            <h2 id="mit-eurem-team" className={LIVE_TYPO.section}>
              Mit eurem Team dabei?
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted sm:text-[15px]">
              Turniere entdecken, bewerben und Status verfolgen – für Vereine und Gäste.
            </p>
          </div>
          <Link
            href="/fuer-vereine"
            className="inline-flex h-11 shrink-0 items-center justify-center border border-navy px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            Für Vereine
          </Link>
        </div>
      </Container>
    </section>
  );
}

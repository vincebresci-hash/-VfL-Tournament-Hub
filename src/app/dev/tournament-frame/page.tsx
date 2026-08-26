import { TournamentImageFrame } from "@/components/brand/TournamentImageFrame";
import { Container } from "@/components/layout/Container";
import { ageGroupImageSrc } from "@/data/tournaments";

/**
 * Lokale Design-Demo für TournamentImageFrame.
 * Nicht für Production-Navigation vorgesehen.
 */
export default function TournamentFrameDemoPage() {
  const samples = [
    { age: "U9", src: ageGroupImageSrc.U9, position: "50% 40%" },
    { age: "U10", src: ageGroupImageSrc.U10, position: "48% 42%" },
    { age: "U12", src: ageGroupImageSrc.U12, position: "50% 45%" },
  ] as const;

  return (
    <main className="min-h-full bg-background py-10">
      <Container>
        <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase">
          Tournament Image Frame Demo
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Card-Variante (stärker) und Hero-Variante (subtiler) — gleiche
          Designsprache, unterschiedliche Originalfotos.
        </p>

        <h2 className="mt-10 font-display text-xl font-bold tracking-wide text-ink uppercase">
          Card (TournamentCard)
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {samples.map((sample) => (
            <article
              key={`card-${sample.age}`}
              className="overflow-hidden rounded-[12px] border border-line bg-white shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
            >
              <TournamentImageFrame
                src={sample.src}
                alt={`Turnierfoto ${sample.age}`}
                variant="card"
                objectPosition={sample.position}
                sizes="(min-width: 1280px) 360px, (min-width: 640px) 45vw, 100vw"
              />
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                  {sample.age} · Card
                </p>
                <p className="mt-1 text-[13px] text-ink">{sample.src}</p>
              </div>
            </article>
          ))}
        </div>

        <h2 className="mt-12 font-display text-xl font-bold tracking-wide text-ink uppercase">
          Detail-Hero (subtiler)
        </h2>
        <div className="mt-4 max-w-3xl overflow-hidden rounded-[12px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,20,28,0.04)] sm:p-5">
          <TournamentImageFrame
            src={ageGroupImageSrc.U11}
            alt="Turnierdetail Hero Beispiel"
            variant="hero"
            objectPosition="50% 40%"
            sizes="(min-width: 1024px) 720px, 100vw"
          />
          <p className="mt-3 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            U11 · Hero
          </p>
        </div>
      </Container>
    </main>
  );
}

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { LIVE_TYPO } from "@/lib/live/match-center";
import {
  IconClipboard,
  IconMessage,
  IconShield,
} from "@/components/ui/icons";

const steps = [
  {
    icon: IconClipboard,
    title: "Einfach bewerben",
    text: "In wenigen Minuten online anmelden – auch als Gast.",
  },
  {
    icon: IconMessage,
    title: "Schnelle Rückmeldung",
    text: "Status und Rückmeldung direkt im Tournament Hub.",
  },
  {
    icon: IconShield,
    title: "Fair & transparent",
    text: "Bewerbung, Teilnahme und Live-Spieltag an einem Ort.",
  },
] as const;

export function HomeHowItWorks() {
  return (
    <section className="bg-background py-10 sm:py-12" aria-labelledby="so-funktionierts">
      <Container>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="so-funktionierts" className={LIVE_TYPO.section}>
            So funktioniert&apos;s
          </h2>
          <Link
            href="/faq"
            className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            FAQ →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="min-w-0">
                <Icon className="h-5 w-5 text-brand-yellow" aria-hidden />
                <h3 className="mt-3 text-[13px] font-semibold tracking-[0.06em] text-ink uppercase">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[13px] leading-5 text-muted">{step.text}</p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

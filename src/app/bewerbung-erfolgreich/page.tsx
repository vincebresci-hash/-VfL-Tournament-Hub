import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Container } from "@/components/layout/Container";
import { IconCheckCircle } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Bewerbung eingegangen",
};

export default function ApplicationSuccessPage() {
  return (
    <div className="flex min-h-full flex-col">
      <Header variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="flex flex-1 flex-col items-start py-16 sm:py-20 lg:py-24">
          <div className="mx-auto w-full max-w-xl text-center">
            <IconCheckCircle className="mx-auto h-16 w-16 text-brand-yellow" />
            <h1 className="mt-8 font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
              Bewerbung eingegangen
            </h1>
            <p className="mt-6 text-base leading-7 text-muted">
              Vielen Dank für eure Bewerbung. Eine Bestätigung wurde an die
              angegebene E-Mail-Adresse gesendet.
            </p>
            <p className="mt-6 text-[15px] leading-7 text-ink">
              Die Bewerbung stellt noch keine Teilnahmebestätigung dar.
            </p>

            <div className="mt-10 border border-line bg-surface px-5 py-6">
              <p className="text-[15px] leading-7 text-ink">
                Möchtet ihr eure Bewerbungen künftig zentral verwalten? Jetzt
                kostenlos Vereinskonto erstellen.
              </p>
              <Link
                href="/registrieren"
                className="mt-4 inline-flex h-11 items-center justify-center border border-navy px-4 text-[12px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                Vereinskonto erstellen
              </Link>
            </div>

            <Link
              href="/turniere"
              className="mt-8 inline-flex h-12 items-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              Zurück zu den Turnieren
            </Link>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

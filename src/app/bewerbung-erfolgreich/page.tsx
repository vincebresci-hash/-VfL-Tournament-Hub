import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { IconCheckCircle } from "@/components/ui/icons";

export const metadata: Metadata = withCanonical("/bewerbung-erfolgreich", {
  title: "Bewerbung eingegangen",
});

export default function ApplicationSuccessPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="flex flex-1 flex-col items-start py-16 sm:py-20 lg:py-24">
          <div className="mx-auto w-full max-w-xl text-center">
            <IconCheckCircle className="mx-auto h-16 w-16 text-brand-yellow" />
            <h1 className="mt-8 font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
              Bewerbung eingegangen
            </h1>
            <p className="mt-6 text-base leading-7 text-muted">
              Vielen Dank für eure Bewerbung.
            </p>
            <p className="mt-2 text-base leading-7 text-muted">
              Wir prüfen eure Angaben und melden uns anschließend bei eurem
              Ansprechpartner.
            </p>
            <p className="mt-6 text-[15px] leading-7 text-ink">
              Wichtig: Die Bewerbung stellt noch keine Teilnahmebestätigung dar.
            </p>
            <Link
              href="/turniere"
              className="mt-10 inline-flex h-12 items-center bg-brand-yellow px-5 text-[13px] font-semibold tracking-[0.1em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
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

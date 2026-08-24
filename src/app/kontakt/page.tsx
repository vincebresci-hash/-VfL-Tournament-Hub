import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import { IconMail, IconPhone } from "@/components/ui/icons";
import {
  organizerDisplayName,
  publicContactEmail,
  publicContactPhone,
} from "@/lib/contact";
import { CLUB_NAME, HUB_NAME } from "@/lib/constants";
import { getAppSettings } from "@/lib/settings";
import Link from "next/link";

export const metadata: Metadata = { title: "Kontakt" };

export default async function KontaktPage() {
  const settings = await getAppSettings();
  const organizer = organizerDisplayName(settings);
  const email = publicContactEmail(settings);
  const phone = publicContactPhone(settings);
  const hasDirectContact = Boolean(email || phone);

  return (
    <ContentPage
      title="Kontakt"
      description="Fragen zu Jugendturnieren und Bewerbungen im Tournament Hub."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="border border-line bg-white p-6 sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Veranstalter
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-wide text-ink uppercase">
            {organizer}
          </h2>
          <p className="mt-2 text-[15px] text-muted">VfL Kirchheim Fußball</p>
          <p className="mt-1 text-[15px] text-muted">
            Bereich Jugendturniere / {HUB_NAME}
          </p>

          <div className="mt-8 grid gap-4">
            {email ? (
              <p className="flex items-start gap-3 text-[15px] text-ink">
                <IconMail className="mt-0.5 h-5 w-5 text-brand-yellow" />
                <a
                  href={`mailto:${email}`}
                  className="underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
                >
                  {email}
                </a>
              </p>
            ) : null}
            {phone ? (
              <p className="flex items-start gap-3 text-[15px] text-ink">
                <IconPhone className="mt-0.5 h-5 w-5 text-brand-yellow" />
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
                >
                  {phone}
                </a>
              </p>
            ) : null}
          </div>

          <p className="mt-8 max-w-xl text-[15px] leading-7 text-muted">
            Für Turnier- und Bewerbungsfragen wendet euch bitte direkt an den
            Bereich Jugendturniere. Allgemeine Vereinsthemen außerhalb des
            Tournament Hub klärt ihr über die üblichen Kanäle von {CLUB_NAME}.
          </p>
        </section>

        <aside className="grid gap-4 self-start">
          {hasDirectContact ? (
            <div className="border border-navy bg-navy p-6 text-white">
              <p className="font-display text-lg font-bold tracking-wide uppercase">
                Nachricht senden
              </p>
              <p className="mt-3 text-[14px] leading-6 text-white/70">
                Schreibt uns zu freien Plätzen, Warteliste oder dem Status eurer
                Bewerbung.
              </p>
              {email ? (
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent("Frage zum Tournament Hub")}`}
                  className="mt-6 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
                >
                  E-Mail schreiben
                </a>
              ) : phone ? (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="mt-6 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
                >
                  Anrufen
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="border border-line bg-white p-6">
            <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Schnelle Hilfe
            </p>
            <p className="mt-3 text-[14px] leading-6 text-muted">
              Viele Antworten zu Zusage, Warteliste und Vereinskonto stehen in den
              FAQ.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Link
                href="/faq"
                className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
              >
                FAQ ansehen →
              </Link>
              <Link
                href="/turniere"
                className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
              >
                Turniere entdecken →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </ContentPage>
  );
}

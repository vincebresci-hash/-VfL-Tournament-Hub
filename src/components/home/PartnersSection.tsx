import { CLUB_NAME, OFFICIAL_CLUB_WEBSITE } from "@/data/club";

/**
 * Keine konkreten Sponsornamen hardcoden, solange sie auf der öffentlichen
 * Sponsoren-Seite nicht als verlässliche Textliste nachweisbar sind.
 * Verweis auf die offizielle Vereinswebsite.
 */
export function PartnersSection() {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.12em] text-white/40 uppercase">
        Unsere Partner
      </p>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-white/55">
        Die Nachwuchsturniere von {CLUB_NAME} werden von Partnern und Sponsoren
        unterstützt. Die aktuelle Übersicht findest du auf der offiziellen
        Vereinswebsite.
      </p>
      <a
        href={`${OFFICIAL_CLUB_WEBSITE}sponsoren/`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex text-[12px] font-semibold tracking-[0.08em] text-white/70 uppercase transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        Sponsoren auf der Vereinswebsite →
      </a>
    </div>
  );
}

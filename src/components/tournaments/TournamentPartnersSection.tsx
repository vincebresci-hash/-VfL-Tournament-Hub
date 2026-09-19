import {
  PartnerLogoGrid,
  PartnerSectionHeader,
} from "@/components/partners/PartnerLogoGrid";
import type { PublicPartner } from "@/types/partner";

type TournamentPartnersSectionProps = {
  partners: PublicPartner[];
};

/**
 * Public tournament detail Partner section (Phase 2C / V2-A strip).
 * Renders nothing when no active assigned Partners exist.
 * Compact horizontal tiles — does not use homepage max-3 layout.
 * No global /partner link — this strip is tournament-assigned only.
 */
export function TournamentPartnersSection({
  partners,
}: TournamentPartnersSectionProps) {
  if (partners.length === 0) {
    return null;
  }

  return (
    <section className="mt-7 sm:mt-8">
      <PartnerSectionHeader
        title="Partner & Sponsoren"
        compact
        tone="secondary"
      />
      <div className="mt-2">
        <PartnerLogoGrid partners={partners} size="tournament" />
      </div>
    </section>
  );
}

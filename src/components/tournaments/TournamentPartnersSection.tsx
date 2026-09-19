import {
  PartnerLogoGrid,
  PartnerSectionHeader,
} from "@/components/partners/PartnerLogoGrid";
import type { PublicPartner } from "@/types/partner";

type TournamentPartnersSectionProps = {
  partners: PublicPartner[];
};

/**
 * Public tournament detail Partner section (Phase 2C).
 * Renders nothing when no active assigned Partners exist.
 */
export function TournamentPartnersSection({
  partners,
}: TournamentPartnersSectionProps) {
  if (partners.length === 0) {
    return null;
  }

  return (
    <section className="mt-10">
      <PartnerSectionHeader title="Partner & Sponsoren" compact />
      <div className="mt-5">
        <PartnerLogoGrid partners={partners} size="home" />
      </div>
    </section>
  );
}

import { notFound } from "next/navigation";
import { ParticipationPortalForm } from "@/components/cancellation/ParticipationPortalForm";
import { ContentPage } from "@/components/layout/ContentPage";
import { loadParticipationPortalByToken } from "@/lib/cancellations/actions";
import { isValidSecureAccessTokenFormat } from "@/lib/cancellations/tokens";

type ParticipationPageProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function ParticipationPage({ params }: ParticipationPageProps) {
  const { token } = await params;

  if (!isValidSecureAccessTokenFormat(token)) {
    notFound();
  }

  const portal = await loadParticipationPortalByToken(token);

  if (!portal) {
    return (
      <ContentPage
        title="Link ungültig"
        description="Dieser Teilnahme-Link ist ungültig oder abgelaufen."
      >
        <div className="mx-auto max-w-2xl border border-line bg-white p-6 text-[14px] leading-6 text-muted">
          Bitte wendet euch bei Fragen an den VfL Kirchheim über die Kontaktseite.
        </div>
      </ContentPage>
    );
  }

  return (
    <ContentPage
      title="Turnierteilnahme"
      description="Über diesen sicheren Link könnt ihr eine Absageanfrage stellen."
    >
      <ParticipationPortalForm token={token} portal={portal} />
    </ContentPage>
  );
}

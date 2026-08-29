import { ContentPage } from "@/components/layout/ContentPage";
import { CommunicationReceiptForm } from "@/components/communications/CommunicationReceiptForm";
import { loadCommunicationReceiptByToken } from "@/lib/communications/communication-receipt-actions";
import { isValidSecureAccessTokenFormat } from "@/lib/cancellations/tokens";

type CommunicationReceiptPageProps = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function CommunicationReceiptPage({
  params,
}: CommunicationReceiptPageProps) {
  const { token } = await params;

  if (!isValidSecureAccessTokenFormat(token)) {
    return (
      <ContentPage
        title="Link ungültig"
        description="Dieser Bestätigungslink ist ungültig oder nicht mehr gültig."
      >
        <div className="mx-auto max-w-2xl border border-line bg-white p-6 text-[14px] leading-6 text-muted">
          Bitte wendet euch bei Fragen an den VfL Kirchheim über die Kontaktseite.
        </div>
      </ContentPage>
    );
  }

  const receipt = await loadCommunicationReceiptByToken(token);

  if (!receipt) {
    return (
      <ContentPage
        title="Link ungültig"
        description="Dieser Bestätigungslink ist ungültig oder nicht mehr gültig."
      >
        <div className="mx-auto max-w-2xl border border-line bg-white p-6 text-[14px] leading-6 text-muted">
          Bitte wendet euch bei Fragen an den VfL Kirchheim über die Kontaktseite.
        </div>
      </ContentPage>
    );
  }

  if (receipt.confirmedAt) {
    return (
      <ContentPage
        title="Empfang bestätigt"
        description="Der Erhalt dieser Information wurde bereits bestätigt."
      >
        <CommunicationReceiptForm token={token} receipt={receipt} />
      </ContentPage>
    );
  }

  return (
    <ContentPage
      title="Mitteilung"
      description="Bitte bestätige den Erhalt dieser Turnierinformation."
    >
      <CommunicationReceiptForm token={token} receipt={receipt} />
    </ContentPage>
  );
}

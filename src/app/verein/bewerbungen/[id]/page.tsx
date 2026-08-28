import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ClubApplicationDetail } from "@/components/club/ClubApplicationDetail";
import { CLUB_LOGIN } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { loadClubApplicationById } from "@/lib/club/workspace";
import { getPendingCancellationForApplication } from "@/lib/cancellations/queries";

type ClubApplicationPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ClubApplicationPageProps): Promise<Metadata> {
  const { id } = await params;
  const application = await loadClubApplicationById(id);

  return {
    title: application ? application.tournamentName : "Bewerbung",
  };
}

export default async function ClubApplicationPage({
  params,
}: ClubApplicationPageProps) {
  const { id } = await params;
  const session = await getAuthSession();

  if (!session) {
    redirect(CLUB_LOGIN);
  }

  const application = await loadClubApplicationById(id);

  if (!application) {
    notFound();
  }

  const pendingCancellation = await getPendingCancellationForApplication(application.id);

  return (
    <ClubApplicationDetail
      application={application}
      pendingCancellation={
        pendingCancellation
          ? {
              id: pendingCancellation.id,
              requestedAt: pendingCancellation.requested_at,
              isLateRequest: pendingCancellation.is_late_request,
            }
          : null
      }
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationDetail } from "@/components/admin/ApplicationDetail";
import { getAdminApplication, getTournamentOccupancy, isClubDatabaseReady } from "@/lib/db/queries";
import { getTournamentBySlugOrId } from "@/lib/db/tournament-queries";

type ApplicationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ApplicationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const ready = await isClubDatabaseReady();
  const application = ready ? await getAdminApplication(id) : null;

  return {
    title: application ? application.clubName : "Bewerbung",
  };
}

export default async function AdminApplicationDetailPage({
  params,
}: ApplicationDetailPageProps) {
  const { id } = await params;
  const ready = await isClubDatabaseReady();
  if (!ready) {
    notFound();
  }

  const application = await getAdminApplication(id);

  if (!application) {
    notFound();
  }

  const tournament = await getTournamentBySlugOrId(application.tournamentId);

  if (!tournament) {
    notFound();
  }

  const occupancy = await getTournamentOccupancy(tournament.slug);
  const tournamentWithCapacity = occupancy
    ? {
        ...tournament,
        maxTeams: occupancy.maxTeams ?? tournament.maxTeams,
        confirmedTeams: occupancy.confirmedTeams,
        waitlistCount: occupancy.waitingListCount,
      }
    : tournament;

  return <ApplicationDetail applicationId={id} tournament={tournamentWithCapacity} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationDetail } from "@/components/admin/ApplicationDetail";
import { applications as seedApplications } from "@/data/applications";
import { getAdminApplication, isClubDatabaseReady } from "@/lib/db/queries";
import { getTournamentById, getTournamentBySlug } from "@/lib/tournaments";

type ApplicationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ApplicationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const ready = await isClubDatabaseReady();
  const application = ready
    ? await getAdminApplication(id)
    : seedApplications.find((item) => item.id === id);

  return {
    title: application ? application.clubName : "Bewerbung",
  };
}

export default async function AdminApplicationDetailPage({
  params,
}: ApplicationDetailPageProps) {
  const { id } = await params;
  const ready = await isClubDatabaseReady();
  const application = ready
    ? await getAdminApplication(id)
    : (seedApplications.find((item) => item.id === id) ?? null);

  if (!application) {
    notFound();
  }

  const tournament =
    getTournamentBySlug(application.tournamentId) ??
    getTournamentById(application.tournamentId);

  if (!tournament) {
    notFound();
  }

  return <ApplicationDetail applicationId={id} tournament={tournament} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentAdminForm } from "@/components/admin/TournamentAdminForm";
import { TournamentPartnerAssignmentCard } from "@/components/admin/TournamentPartnerAssignmentCard";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { getTournamentOccupancy, listAdminApplications } from "@/lib/db/queries";
import { getAdminTournamentPartnerAssignmentState } from "@/lib/partners/queries";

type TournamentEditPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: TournamentEditPageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament =
    (await getAdminTournamentById(id)) ?? (await getAdminTournamentBySlug(id));

  return {
    title: tournament ? `${tournament.name} bearbeiten` : "Turnier bearbeiten",
  };
}

export default async function AdminTournamentEditPage({
  params,
}: TournamentEditPageProps) {
  const { id } = await params;
  const [tournament, applicationsResult] = await Promise.all([
    getAdminTournamentById(id).then((row) => row ?? getAdminTournamentBySlug(id)),
    listAdminApplications(),
  ]);

  if (!tournament) {
    notFound();
  }

  const [applicationCount, occupancy, assignmentState] = await Promise.all([
    Promise.resolve(
      applicationsResult.applications.filter(
        (application) =>
          application.tournamentId === tournament.slug ||
          application.tournamentId === tournament.id,
      ).length,
    ),
    getTournamentOccupancy(tournament.slug),
    getAdminTournamentPartnerAssignmentState(tournament.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Turnier bearbeiten
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
        Änderungen werden direkt in Supabase gespeichert und auf den öffentlichen
        Seiten übernommen.
      </p>
      <div className="mt-8 space-y-6">
        <TournamentAdminForm
          tournament={tournament}
          applicationCount={applicationCount}
          confirmedParticipants={occupancy?.confirmedTeams ?? 0}
        />
        <TournamentPartnerAssignmentCard
          tournamentId={tournament.id}
          assignmentState={assignmentState}
        />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TournamentAdminForm } from "@/components/admin/TournamentAdminForm";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { listAdminApplications } from "@/lib/db/queries";

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

  const applicationCount = applicationsResult.applications.filter(
    (application) =>
      application.tournamentId === tournament.slug ||
      application.tournamentId === tournament.id,
  ).length;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Turnier bearbeiten
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
        Änderungen werden direkt in Supabase gespeichert und auf den öffentlichen
        Seiten übernommen.
      </p>
      <div className="mt-8">
        <TournamentAdminForm
          tournament={tournament}
          applicationCount={applicationCount}
        />
      </div>
    </div>
  );
}

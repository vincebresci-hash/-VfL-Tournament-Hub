import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminTournamentDetailView } from "@/components/admin/AdminTournamentDetailView";
import { getAdminTournamentBySlug } from "@/lib/db/admin-queries";
import { listAdminApplications } from "@/lib/db/queries";
import { getPublicTournaments } from "@/lib/tournaments";

type TournamentEditPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getPublicTournaments().map((tournament) => ({ slug: tournament.slug }));
}

export async function generateMetadata({
  params,
}: TournamentEditPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await getAdminTournamentBySlug(slug);

  return {
    title: tournament ? tournament.name : "Turnier",
  };
}

export default async function AdminTournamentEditPage({
  params,
}: TournamentEditPageProps) {
  const { slug } = await params;
  const [tournament, applicationsResult] = await Promise.all([
    getAdminTournamentBySlug(slug),
    listAdminApplications(),
  ]);

  if (!tournament) {
    notFound();
  }

  return (
    <AdminTournamentDetailView
      tournament={tournament}
      applications={applicationsResult.applications}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";
import { getPublicTournaments, getTournamentBySlug } from "@/lib/tournaments";

type TournamentEditPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getPublicTournaments().map((tournament) => ({ slug: tournament.slug }));
}

export async function generateMetadata({
  params,
}: TournamentEditPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = getTournamentBySlug(slug);

  return {
    title: tournament ? `Bearbeiten · ${tournament.name}` : "Turnier bearbeiten",
  };
}

export default async function AdminTournamentEditPage({
  params,
}: TournamentEditPageProps) {
  const { slug } = await params;
  const tournament = getTournamentBySlug(slug);

  if (!tournament) {
    notFound();
  }

  return (
    <AdminPlaceholder
      title={tournament.name}
      description="Die Bearbeitung von Turnieren wird später angebunden. Die Oberfläche ist bereits vorbereitet."
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminTeamDetailView } from "@/components/admin/AdminTeamDetailView";
import { getAdminTeam } from "@/lib/db/admin-queries";

type AdminTeamPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: AdminTeamPageProps): Promise<Metadata> {
  const { id } = await params;
  const team = await getAdminTeam(id);

  return { title: team ? team.name : "Team" };
}

export default async function AdminTeamPage({ params }: AdminTeamPageProps) {
  const { id } = await params;
  const team = await getAdminTeam(id);

  if (!team) {
    notFound();
  }

  return <AdminTeamDetailView team={team} />;
}

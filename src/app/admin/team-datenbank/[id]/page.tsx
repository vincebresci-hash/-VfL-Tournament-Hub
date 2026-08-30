import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamDirectoryDetailView } from "@/components/admin/TeamDirectoryDetailView";
import { getTeamDirectoryAccessFlags } from "@/lib/team-directory/access";
import {
  getTeamDirectoryEntry,
  loadTeamDirectoryHistory,
} from "@/lib/team-directory/queries";

type TeamDirectoryDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: TeamDirectoryDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const entry = await getTeamDirectoryEntry(id);

  return {
    title: entry ? `${entry.teamName} · Team-Datenbank` : "Team-Datenbank",
  };
}

export default async function TeamDirectoryDetailPage({
  params,
}: TeamDirectoryDetailPageProps) {
  const { id } = await params;
  const entry = await getTeamDirectoryEntry(id);

  if (!entry) {
    notFound();
  }

  const [history, access] = await Promise.all([
    loadTeamDirectoryHistory(entry),
    getTeamDirectoryAccessFlags(),
  ]);

  return (
    <TeamDirectoryDetailView
      entry={entry}
      history={history}
      canManage={access.canManage}
    />
  );
}

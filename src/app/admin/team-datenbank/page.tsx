import type { Metadata } from "next";
import { TeamDirectoryBoard } from "@/components/admin/TeamDirectoryBoard";
import { AdminPageHeader } from "@/components/admin/AdminPanel";
import { listTeamDirectoryEntries } from "@/lib/team-directory/queries";

export const metadata: Metadata = {
  title: "Team-Datenbank",
};

export const dynamic = "force-dynamic";

export default async function AdminTeamDirectoryPage() {
  const { entries, ready } = await listTeamDirectoryEntries({
    archivedFilter: "all",
  });

  return (
    <div>
      <AdminPageHeader
        title="Team-Datenbank"
        description="Archivierte Teams für spätere Turniereinladungen. Teams werden nur bewusst übernommen, nicht automatisch."
      />
      <TeamDirectoryBoard entries={entries} ready={ready} />
    </div>
  );
}

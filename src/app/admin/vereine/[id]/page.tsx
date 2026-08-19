import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminClubDetailView } from "@/components/admin/AdminClubDetailView";
import { getAdminClub } from "@/lib/db/admin-queries";

type AdminClubPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: AdminClubPageProps): Promise<Metadata> {
  const { id } = await params;
  const club = await getAdminClub(id);

  return { title: club ? club.name : "Verein" };
}

export default async function AdminClubPage({ params }: AdminClubPageProps) {
  const { id } = await params;
  const club = await getAdminClub(id);

  if (!club) {
    notFound();
  }

  return <AdminClubDetailView club={club} />;
}

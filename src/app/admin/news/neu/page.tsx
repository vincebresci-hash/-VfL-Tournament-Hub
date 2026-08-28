import type { Metadata } from "next";
import { NewsAdminForm } from "@/components/admin/NewsAdminForm";
import { listAdminTournaments } from "@/lib/db/admin-queries";

export const metadata: Metadata = { title: "Neue News" };

export default async function AdminNewNewsPage() {
  const tournaments = await listAdminTournaments();

  return <NewsAdminForm tournaments={tournaments} />;
}

import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getAdminDashboardData } from "@/lib/db/admin-queries";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminHomePage() {
  const data = await getAdminDashboardData();
  return <AdminDashboard data={data} />;
}

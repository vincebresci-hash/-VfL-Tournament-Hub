import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const metadata: Metadata = { title: "Einstellungen" };

export default function AdminSettingsPage() {
  return (
    <AdminPlaceholder
      title="Einstellungen"
      description="Einstellungen für den internen Bereich folgen später. Ein echtes Login ist in diesem Schritt noch nicht vorgesehen."
    />
  );
}

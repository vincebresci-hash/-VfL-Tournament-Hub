import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const metadata: Metadata = { title: "Vereine" };

export default function AdminClubsPage() {
  return (
    <AdminPlaceholder
      title="Vereine"
      description="Die Vereinsübersicht folgt später und wird an denselben Datenbestand angebunden."
    />
  );
}

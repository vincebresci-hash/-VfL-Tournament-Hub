import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const metadata: Metadata = { title: "Teams" };

export default function AdminTeamsPage() {
  return (
    <AdminPlaceholder
      title="Teams"
      description="Die Teamverwaltung folgt später. Bewerbungen können bereits jetzt intern geprüft werden."
    />
  );
}

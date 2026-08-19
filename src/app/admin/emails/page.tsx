import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const metadata: Metadata = { title: "E-Mails" };

export default function AdminEmailsPage() {
  return (
    <AdminPlaceholder
      title="E-Mails"
      description="Der Versand und die Vorlagen für Rückmeldungen werden in einem späteren Schritt angebunden."
    />
  );
}

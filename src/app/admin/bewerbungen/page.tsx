import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationsBoard } from "@/components/admin/ApplicationsBoard";

export const metadata: Metadata = {
  title: "Bewerbungen",
};

export default function AdminApplicationsPage() {
  return (
    <Suspense fallback={<p className="text-[15px] text-muted">Bewerbungen werden geladen.</p>}>
      <ApplicationsBoard />
    </Suspense>
  );
}

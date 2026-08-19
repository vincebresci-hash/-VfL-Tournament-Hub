import type { Metadata } from "next";
import { TournamentsAdminBoard } from "@/components/admin/TournamentsAdminBoard";

export const metadata: Metadata = {
  title: "Turniere",
};

export default function AdminTournamentsPage() {
  return <TournamentsAdminBoard />;
}

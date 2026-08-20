import type { Metadata } from "next";
import { TournamentAdminForm } from "@/components/admin/TournamentAdminForm";

export const metadata: Metadata = { title: "Neues Turnier" };

export default function AdminNewTournamentPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Neues Turnier
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
        Das Turnier wird in Supabase gespeichert und anschließend öffentlich angezeigt.
      </p>
      <div className="mt-8">
        <TournamentAdminForm />
      </div>
    </div>
  );
}

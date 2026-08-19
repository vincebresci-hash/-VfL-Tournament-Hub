import type { Metadata } from "next";
import { ClubLogoutButton } from "@/components/club/ClubLogoutButton";

export const metadata: Metadata = { title: "Einstellungen" };

export default function ClubSettingsPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Einstellungen
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">
        Kontoverwaltung, Benachrichtigungen und Zugangsdaten folgen mit der
        echten Anmeldung über Supabase Auth.
      </p>
      <div className="mt-8 border border-line bg-white px-5 py-6">
        <p className="text-[14px] text-muted">
          Super-Admin-Funktionen wie das Anlegen oder Deaktivieren von Admins
          sind für Vereinskonten nicht vorgesehen.
        </p>
        <div className="mt-5">
          <ClubLogoutButton />
        </div>
      </div>
    </div>
  );
}

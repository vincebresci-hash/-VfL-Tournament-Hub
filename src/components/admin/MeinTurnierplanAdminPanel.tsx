import Link from "next/link";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
import { isSafeHttpUrl } from "@/lib/mein-turnierplan";
import type { AdminTournamentRecord } from "@/types/admin";

type MeinTurnierplanAdminPanelProps = {
  tournament: AdminTournamentRecord;
};

export function MeinTurnierplanAdminPanel({
  tournament,
}: MeinTurnierplanAdminPanelProps) {
  const active =
    tournament.meinTurnierplanEnabled &&
    isSafeHttpUrl(tournament.meinTurnierplanUrl ?? "");
  const url = tournament.meinTurnierplanUrl?.trim() ?? "";

  return (
    <AdminCard title="MeinTurnierplan">
      <dl className="grid gap-3 sm:grid-cols-2">
        <AdminInfo label="Status" value={active ? "Aktiv" : "Inaktiv"} />
        <AdminInfo
          label="Button-Beschriftung"
          value={displayValue(tournament.meinTurnierplanLabel)}
        />
        <AdminInfo
          label="URL"
          value={url ? url : "—"}
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        {active ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            Öffnen
          </a>
        ) : null}
        <Link
          href={`/admin/turniere/${tournament.id}/bearbeiten`}
          className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          Bearbeiten
        </Link>
      </div>
    </AdminCard>
  );
}

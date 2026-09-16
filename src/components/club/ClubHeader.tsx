"use client";

import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { IconClose, IconMenu } from "@/components/ui/icons";

type ClubHeaderProps = {
  open: boolean;
  clubName: string;
  clubLogoUrl?: string | null;
  onToggle: () => void;
};

export function ClubHeader({
  open,
  clubName,
  clubLogoUrl = null,
  onToggle,
}: ClubHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <ParticipantClubLogo logoUrl={clubLogoUrl} clubName={clubName} size="sm" />
        <p className="truncate text-[12px] font-semibold tracking-[0.1em] text-ink uppercase">
          {clubName}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-10 w-10 items-center justify-center text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        aria-expanded={open}
        aria-controls="club-sidebar"
        aria-label={open ? "Menü schließen" : "Menü öffnen"}
      >
        {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
      </button>
    </header>
  );
}

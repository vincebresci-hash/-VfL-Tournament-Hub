"use client";

import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { cn } from "@/lib/cn";
import type { LiveLogoSize } from "@/lib/live/match-center";

export type TeamMark = {
  logoUrl: string | null;
  clubName: string;
};

type TeamNameWithLogoProps = {
  label: string;
  logoUrl?: string | null;
  clubName?: string | null;
  size?: LiveLogoSize;
  className?: string;
  nameClassName?: string;
};

/**
 * Presentation-only team identity: optional logo + mandatory textual name.
 * Missing/broken logo → text only (no letter tile / crest placeholder).
 */
export function TeamNameWithLogo({
  label,
  logoUrl,
  clubName,
  size = "xs",
  className,
  nameClassName,
}: TeamNameWithLogoProps) {
  const markName = clubName?.trim() || label;

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <ParticipantClubLogo
        logoUrl={logoUrl}
        clubName={markName}
        size={size}
        fallback="none"
      />
      <span className={cn("min-w-0 leading-snug font-medium break-words text-ink", nameClassName)}>
        {label}
      </span>
    </span>
  );
}

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
  logoFallback?: "initial" | "none";
};

/** Fixed logo slot classes — match ParticipantClubLogo size boxes for alignment. */
function logoSlotClass(size: LiveLogoSize) {
  if (size === "xs") return "h-5 w-5 sm:h-6 sm:w-6";
  if (size === "sm") return "h-8 w-8";
  if (size === "lg") return "h-12 w-12";
  return "h-10 w-10";
}

/**
 * Presentation-only team identity: optional logo + mandatory textual name.
 * Always reserves a fixed logo slot so names align with or without a logo.
 * Missing/broken logos use the caller-selected fallback. Classic views keep
 * the empty slot while Champions-League views opt into one initial tile.
 */
export function TeamNameWithLogo({
  label,
  logoUrl,
  clubName,
  size = "xs",
  className,
  nameClassName,
  logoFallback = "none",
}: TeamNameWithLogoProps) {
  const markName = clubName?.trim() || label;

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden",
          logoSlotClass(size),
        )}
      >
        <ParticipantClubLogo
          logoUrl={logoUrl}
          clubName={markName}
          size={size}
          fallback={logoFallback}
        />
      </span>
      <span className={cn("min-w-0 leading-snug font-medium break-words text-ink", nameClassName)}>
        {label}
      </span>
    </span>
  );
}

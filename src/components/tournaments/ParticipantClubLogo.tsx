"use client";

import { useState } from "react";
import Image from "next/image";
import { LIVE_LOGO_SIZE, type LiveLogoSize } from "@/lib/live/match-center";
import { cn } from "@/lib/cn";

type ParticipantClubLogoProps = {
  logoUrl: string | null | undefined;
  clubName: string;
  className?: string;
  size?: LiveLogoSize;
  /**
   * initial (default): letter tile when no logo — preserves existing LIVE/Teilnehmer UI.
   * none: render nothing when missing/broken — for match/table/placement rows.
   */
  fallback?: "initial" | "none";
};

export function ParticipantClubLogo({
  logoUrl,
  clubName,
  className = "",
  size = "md",
  fallback = "initial",
}: ParticipantClubLogoProps) {
  const trimmed = logoUrl?.trim() || null;
  /** Tracks the exact src that failed so a new logoUrl cannot inherit a prior failure. */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(trimmed) && failedSrc === trimmed;
  const px = LIVE_LOGO_SIZE[size];
  const sizeClass =
    size === "xs"
      ? "h-5 w-5 sm:h-6 sm:w-6"
      : size === "sm"
        ? "h-8 w-8"
        : size === "lg"
          ? "h-12 w-12"
          : "h-10 w-10";

  if (trimmed && !failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden bg-white",
          sizeClass,
          className,
        )}
      >
        <Image
          src={trimmed}
          alt={fallback === "none" ? "" : `Logo ${clubName}`}
          width={px}
          height={px}
          unoptimized
          className="h-full w-full object-contain"
          onError={() => setFailedSrc(trimmed)}
        />
      </span>
    );
  }

  if (fallback === "none") {
    return null;
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-line bg-surface text-[10px] font-semibold tracking-[0.08em] text-muted uppercase",
        sizeClass,
        className,
      )}
      title="Kein Logo"
    >
      {clubName.trim().slice(0, 1) || "V"}
    </span>
  );
}

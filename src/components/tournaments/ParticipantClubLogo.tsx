import Image from "next/image";
import { LIVE_LOGO_SIZE, type LiveLogoSize } from "@/lib/live/match-center";
import { cn } from "@/lib/cn";

type ParticipantClubLogoProps = {
  logoUrl: string | null | undefined;
  clubName: string;
  className?: string;
  size?: LiveLogoSize;
};

export function ParticipantClubLogo({
  logoUrl,
  clubName,
  className = "",
  size = "md",
}: ParticipantClubLogoProps) {
  const trimmed = logoUrl?.trim() || null;
  const px = LIVE_LOGO_SIZE[size];
  const sizeClass =
    size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";

  if (trimmed) {
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
          alt={`Logo ${clubName}`}
          width={px}
          height={px}
          unoptimized
          className="h-full w-full object-contain"
        />
      </span>
    );
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

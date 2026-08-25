import Image from "next/image";

type ParticipantClubLogoProps = {
  logoUrl: string | null | undefined;
  clubName: string;
  className?: string;
};

export function ParticipantClubLogo({
  logoUrl,
  clubName,
  className = "",
}: ParticipantClubLogoProps) {
  const trimmed = logoUrl?.trim() || null;

  if (trimmed) {
    return (
      <span
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-white ${className}`}
      >
        <Image
          src={trimmed}
          alt={`Logo ${clubName}`}
          width={40}
          height={40}
          unoptimized
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-surface text-[10px] font-semibold tracking-[0.08em] text-muted uppercase ${className}`}
      title="Kein Logo"
    >
      {clubName.trim().slice(0, 1) || "V"}
    </span>
  );
}

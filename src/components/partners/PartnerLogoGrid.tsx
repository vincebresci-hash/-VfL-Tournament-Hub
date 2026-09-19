import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { PublicPartner } from "@/types/partner";

type PartnerLogoCardProps = {
  partner: PublicPartner;
  /** Larger card treatment for /partner page. Compact horizontal for tournament detail. */
  size?: "home" | "page" | "tournament";
  className?: string;
};

export function PartnerLogoCard({
  partner,
  size = "home",
  className,
}: PartnerLogoCardProps) {
  const isPage = size === "page";
  const isTournament = size === "tournament";

  if (isTournament) {
    const content = (
      <>
        <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line/80 bg-surface">
          {partner.logoUrl ? (
            <Image
              src={partner.logoUrl}
              alt={`${partner.name} Logo`}
              width={64}
              height={48}
              unoptimized
              className="max-h-full max-w-full object-contain p-1"
            />
          ) : (
            <span className="px-1 text-center font-display text-[10px] font-bold tracking-wide text-navy/70 uppercase">
              {partner.name.slice(0, 3)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[13px] font-bold tracking-[0.04em] text-ink uppercase">
            {partner.name}
          </span>
        </span>
      </>
    );

    const cardClass = cn(
      "flex h-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5",
      "shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
      "motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200",
      "[@media(hover:hover)]:hover:-translate-y-0.5",
      "[@media(hover:hover)]:hover:border-brand-yellow/70",
      "[@media(hover:hover)]:hover:shadow-[0_8px_18px_rgba(16,20,28,0.07)]",
      "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow",
      className,
    );

    if (partner.websiteUrl) {
      return (
        <a
          href={partner.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(cardClass, "block")}
          aria-label={`${partner.name} Website`}
        >
          {content}
        </a>
      );
    }

    return <div className={cardClass}>{content}</div>;
  }

  const logoBoxClass = isPage
    ? "flex h-28 w-full items-center justify-center sm:h-32"
    : "flex h-[4.5rem] w-full items-center justify-center sm:h-20";

  const content = (
    <>
      <div className={logoBoxClass}>
        {partner.logoUrl ? (
          <Image
            src={partner.logoUrl}
            alt={`${partner.name} Logo`}
            width={isPage ? 220 : 160}
            height={isPage ? 110 : 80}
            unoptimized
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="px-3 text-center font-display text-[12px] font-bold tracking-wide text-navy/70 uppercase sm:text-sm">
            {partner.name}
          </span>
        )}
      </div>
      {isPage ? (
        <div className="mt-4 border-t border-line/80 pt-3 text-center">
          <p className="font-display text-[13px] font-bold tracking-[0.06em] text-ink uppercase sm:text-sm">
            {partner.name}
          </p>
          {partner.websiteUrl ? (
            <span className="mt-2 inline-flex min-h-10 items-center text-[12px] font-semibold tracking-[0.06em] text-brand-blue uppercase">
              Website besuchen
            </span>
          ) : null}
        </div>
      ) : partner.logoUrl ? (
        <p className="mt-2 truncate text-center text-[11px] font-medium tracking-[0.04em] text-muted">
          {partner.name}
        </p>
      ) : null}
    </>
  );

  const cardClass = cn(
    "h-full rounded-[12px] border border-line bg-white p-4 sm:p-5",
    "shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
    "motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200",
    "[@media(hover:hover)]:hover:-translate-y-0.5",
    "[@media(hover:hover)]:hover:scale-[1.01]",
    "[@media(hover:hover)]:hover:border-brand-yellow/70",
    "[@media(hover:hover)]:hover:shadow-[0_10px_22px_rgba(16,20,28,0.08)]",
    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow",
    className,
  );

  if (partner.websiteUrl) {
    return (
      <a
        href={partner.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(cardClass, "block")}
        aria-label={`${partner.name} Website`}
      >
        {content}
      </a>
    );
  }

  return <div className={cardClass}>{content}</div>;
}

type PartnerLogoGridProps = {
  partners: PublicPartner[];
  size?: "home" | "page" | "tournament";
  className?: string;
};

/**
 * Homepage preview: caller passes at most 3 partners (one even row on sm+).
 * /partner shows the complete active list.
 * Tournament detail uses compact horizontal tiles (size="tournament").
 */
export function PartnerLogoGrid({
  partners,
  size = "home",
  className,
}: PartnerLogoGridProps) {
  if (partners.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        size === "page"
          ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          : size === "tournament"
            ? "flex flex-wrap gap-3"
            : "grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 sm:gap-4",
        className,
      )}
    >
      {partners.map((partner) => (
        <li
          key={partner.id}
          className={cn(
            "min-w-0",
            size === "tournament" && "w-full max-w-[17.5rem] sm:w-[15.75rem]",
          )}
        >
          <PartnerLogoCard partner={partner} size={size} />
        </li>
      ))}
    </ul>
  );
}

export function PartnerSectionHeader({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        compact ? "gap-2" : "sm:gap-3",
      )}
    >
      <div className="min-w-0">
        <h2
          className={cn(
            "font-display font-bold tracking-wide text-ink uppercase",
            compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "max-w-2xl text-muted",
              compact
                ? "mt-1 text-[14px] leading-6"
                : "mt-2 text-[15px] leading-7",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PartnerEmptyState({
  message,
  ctaHref,
  ctaLabel,
}: {
  message: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="text-[14px] leading-6 text-muted">{message}</p>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="inline-flex min-h-10 shrink-0 items-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

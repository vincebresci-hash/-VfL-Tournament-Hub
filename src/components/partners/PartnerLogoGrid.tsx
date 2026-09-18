import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { PublicPartner } from "@/types/partner";

type PartnerLogoCardProps = {
  partner: PublicPartner;
  /** Larger card treatment for /partner page. */
  size?: "home" | "page";
  className?: string;
};

export function PartnerLogoCard({
  partner,
  size = "home",
  className,
}: PartnerLogoCardProps) {
  const isPage = size === "page";
  const logoBoxClass = isPage
    ? "flex h-28 w-full items-center justify-center sm:h-32"
    : "flex h-20 w-full items-center justify-center sm:h-24";

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
          <span className="px-3 text-center font-display text-sm font-bold tracking-wide text-navy/70 uppercase">
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
      ) : null}
    </>
  );

  const cardClass = cn(
    "rounded-[12px] border border-line bg-white p-4 sm:p-5",
    "shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
    "motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200",
    "[@media(hover:hover)]:hover:-translate-y-0.5",
    "[@media(hover:hover)]:hover:border-navy/15",
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
  size?: "home" | "page";
  className?: string;
};

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
          : "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {partners.map((partner) => (
        <li key={partner.id}>
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-blue uppercase">
          Partner
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
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
    <div className="rounded-[12px] border border-dashed border-line bg-white/70 px-5 py-8 text-center">
      <p className="text-[15px] leading-7 text-muted">{message}</p>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex min-h-11 items-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

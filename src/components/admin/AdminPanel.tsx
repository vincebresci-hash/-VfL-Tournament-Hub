import type { ReactNode } from "react";

/** Primary page CTA — VfL yellow. Use at most one in a page header. */
export const adminPrimaryButtonClass =
  "inline-flex h-11 items-center justify-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";

/** Secondary / outline action. */
export const adminSecondaryButtonClass =
  "inline-flex h-11 items-center justify-center border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60";

/** Destructive action — never styled like the primary CTA. */
export const adminDestructiveButtonClass =
  "inline-flex h-11 items-center justify-center border border-[#d9b0b0] bg-[#fff5f5] px-4 text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase hover:bg-[#fdecec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a2b2b] disabled:opacity-60";

/** Low-emphasis navigation / minor action. */
export const adminTextLinkClass =
  "inline-flex h-10 items-center text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  /** Optional primary (or secondary) actions — keep to one dominant primary CTA. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function AdminCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-line bg-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AdminInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[14px] leading-6 text-ink">{value}</dd>
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-line bg-white px-5 py-8 text-[15px] text-muted">
      {children}
    </p>
  );
}

export function AdminNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 border border-line bg-white px-5 py-4 text-[14px] text-muted">
      {children}
    </p>
  );
}

export function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

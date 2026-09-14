import type { ReactNode } from "react";

/** Shared elevated surface for admin cards / panels. */
export const adminCardShellClass =
  "rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

/** Primary page CTA — VfL yellow. Use at most one in a page header. */
export const adminPrimaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.06em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";

/** Secondary / outline action. */
export const adminSecondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:border-navy/25 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60";

/** Destructive action — never styled like the primary CTA. */
export const adminDestructiveButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg border border-[#d9b0b0] bg-[#fff5f5] px-4 text-[12px] font-semibold tracking-[0.06em] text-[#9a2b2b] uppercase transition-colors hover:bg-[#fdecec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a2b2b] disabled:opacity-60";

/** Low-emphasis navigation / minor action. */
export const adminTextLinkClass =
  "inline-flex h-9 items-center rounded-md px-1 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

/** Compact primary CTA for dense list/table rows. */
export const adminCompactPrimaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-md bg-brand-yellow px-3 text-[11px] font-semibold tracking-[0.06em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60";

/** Compact secondary action for dense list/table rows. */
export const adminCompactSecondaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-md border border-line bg-white px-3 text-[11px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:border-navy/25 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60";

/** Shared filter/search shell for admin list pages. */
export const adminFilterShellClass = `${adminCardShellClass} p-3.5 sm:p-4`;

/** Shared filter control (input/select) styling. */
export const adminFilterControlClass =
  "h-10 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-[13px] text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

/** Shared status badge chrome — color classes supplied by callers. */
export const adminStatusBadgeClass =
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase";

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[14px] leading-6 text-muted">{description}</p>
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
    <section className={`${adminCardShellClass} p-4 sm:p-5`}>
      <h2 className="font-display text-[15px] font-bold tracking-[0.04em] text-ink uppercase sm:text-base">
        {title}
      </h2>
      <div className="mt-3 border-t border-line/70 pt-3">{children}</div>
    </section>
  );
}

export function AdminInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-[0.08em] text-ink/50 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-[14px] leading-5 font-medium text-ink">
        {value}
      </dd>
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <p
      className={`${adminCardShellClass} px-5 py-8 text-[15px] leading-6 text-muted break-words`}
    >
      {children}
    </p>
  );
}

export function AdminNotice({ children }: { children: ReactNode }) {
  return (
    <p className={`mt-5 ${adminCardShellClass} px-4 py-3.5 text-[14px] text-muted`}>
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

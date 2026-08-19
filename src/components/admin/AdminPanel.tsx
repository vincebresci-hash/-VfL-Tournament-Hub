import type { ReactNode } from "react";

export function AdminPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">{description}</p>
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

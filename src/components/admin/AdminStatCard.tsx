type AdminStatCardProps = {
  value: number;
  label: string;
  /** Visually secondary — smaller type, less padding. Same data. */
  compact?: boolean;
};

export function AdminStatCard({ value, label, compact = false }: AdminStatCardProps) {
  return (
    <article
      className={
        compact
          ? "border border-line bg-white px-4 py-3"
          : "border border-line bg-white px-5 py-5"
      }
    >
      <p
        className={
          compact
            ? "font-display text-2xl font-bold tracking-wide text-ink"
            : "font-display text-4xl font-bold tracking-wide text-ink"
        }
      >
        {value}
      </p>
      <p
        className={
          compact
            ? "mt-1 text-[10px] font-semibold tracking-[0.12em] text-muted uppercase"
            : "mt-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase"
        }
      >
        {label}
      </p>
    </article>
  );
}

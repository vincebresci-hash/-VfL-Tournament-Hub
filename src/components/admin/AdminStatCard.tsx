type AdminStatCardProps = {
  value: number;
  label: string;
};

export function AdminStatCard({ value, label }: AdminStatCardProps) {
  return (
    <article className="border border-line bg-white px-5 py-5">
      <p className="font-display text-4xl font-bold tracking-wide text-ink">
        {value}
      </p>
      <p className="mt-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        {label}
      </p>
    </article>
  );
}

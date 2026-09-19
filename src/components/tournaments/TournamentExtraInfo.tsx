type TournamentExtraInfoProps = {
  items: Array<{ key: string; label: string; value: string }>;
};

/**
 * V2-A secondary public info (filledPublicInfo) — retained below Beschreibung.
 */
export function TournamentExtraInfo({ items }: TournamentExtraInfoProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-7 grid gap-2.5 sm:mt-8 md:grid-cols-2">
      {items.map((item) => (
        <article
          key={item.key}
          className="rounded-[10px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,20,28,0.04)] sm:p-5"
        >
          <h2 className="font-display text-base font-bold tracking-[0.06em] text-ink uppercase sm:text-lg">
            {item.label}
          </h2>
          <p className="mt-2.5 whitespace-pre-line text-[15px] leading-7 text-muted">
            {item.value}
          </p>
        </article>
      ))}
    </section>
  );
}

type TournamentDescriptionProps = {
  description: string;
};

/**
 * V2-A Beschreibung — presentational only; content is not rewritten.
 */
export function TournamentDescription({ description }: TournamentDescriptionProps) {
  return (
    <section className="mt-10 sm:mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-bold tracking-[0.06em] text-ink uppercase sm:text-2xl">
        <span
          className="mr-2 inline-block h-4 w-1 translate-y-0.5 bg-brand-yellow align-middle"
          aria-hidden="true"
        />
        Beschreibung
      </h2>
      <p className="mt-4 whitespace-pre-line text-base leading-8 text-muted">
        {description}
      </p>
    </section>
  );
}

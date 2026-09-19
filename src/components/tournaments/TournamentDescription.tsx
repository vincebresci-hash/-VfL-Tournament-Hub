type TournamentDescriptionProps = {
  description: string;
};

/**
 * V2-A Beschreibung — presentational only; content is not rewritten.
 */
export function TournamentDescription({ description }: TournamentDescriptionProps) {
  return (
    <section className="mt-7 sm:mt-8 max-w-3xl">
      <h2 className="font-display text-lg font-bold tracking-[0.06em] text-ink uppercase sm:text-xl">
        <span
          className="mr-2 inline-block h-3.5 w-1 translate-y-0.5 bg-brand-yellow align-middle"
          aria-hidden="true"
        />
        Beschreibung
      </h2>
      <p className="mt-3 whitespace-pre-line text-base leading-7 text-muted sm:leading-8">
        {description}
      </p>
    </section>
  );
}

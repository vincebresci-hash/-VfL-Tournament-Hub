type AdminPlaceholderProps = {
  title: string;
  description: string;
};

export function AdminPlaceholder({ title, description }: AdminPlaceholderProps) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">{description}</p>
      <p className="mt-8 border border-line bg-white px-5 py-8 text-[14px] text-muted">
        Dieser Bereich ist vorbereitet und wird später angebunden.
      </p>
    </div>
  );
}

const partners = [
  "uhlsport",
  "SPORT SCHWAB",
  "Kreissparkasse Esslingen-Nürtingen",
];

export function PartnersSection() {
  return (
    <div className="lg:border-l lg:border-white/10 lg:pl-12">
      <p className="text-[11px] font-medium tracking-[0.12em] text-white/40 uppercase">
        Unsere Partner
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {partners.map((partner) => (
          <li
            key={partner}
            className="text-sm font-medium tracking-[0.04em] text-white/55 uppercase"
          >
            {partner}
          </li>
        ))}
      </ul>
    </div>
  );
}

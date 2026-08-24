export function PartnersSection() {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.12em] text-white/40 uppercase">
        Unsere Partner
      </p>
      <ul className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-8">
        {["uhlsport", "SPORT SCHWAB", "Kreissparkasse Esslingen-Nürtingen"].map(
          (partner) => (
            <li
              key={partner}
              className="text-sm font-medium tracking-[0.04em] text-white/55 uppercase"
            >
              {partner}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

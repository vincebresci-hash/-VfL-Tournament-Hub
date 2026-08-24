import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { CLUB_NAME, CLUB_SLOGAN, OFFICIAL_CLUB_WEBSITE } from "@/data/club";
import { HUB_NAME } from "@/lib/constants";
import { footerNavigation, legalNavigation } from "@/lib/navigation";

export function Footer() {
  return (
    <footer className="mt-auto bg-navy text-white">
      <Container className="py-10 sm:py-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/"
              className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
            >
              <Logo className="h-10" />
              <span className="leading-tight">
                <span className="block text-sm font-semibold tracking-wide">
                  {CLUB_NAME}
                </span>
                <span className="mt-0.5 block text-[12px] text-white/55">
                  {CLUB_SLOGAN}
                </span>
              </span>
            </Link>
            <p className="mt-3 text-[11px] font-medium tracking-[0.12em] text-white/40 uppercase">
              {HUB_NAME}
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {footerNavigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[12px] font-medium tracking-[0.08em] text-white/70 uppercase transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Rechtliches">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {legalNavigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-white/55 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={OFFICIAL_CLUB_WEBSITE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-white/55 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
                >
                  Offizielle Vereinswebsite
                </a>
              </li>
            </ul>
          </nav>
          <p className="text-sm text-white/45">© {CLUB_NAME}</p>
        </div>
      </Container>
    </footer>
  );
}

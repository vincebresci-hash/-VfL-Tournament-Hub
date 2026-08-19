"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { IconLogout } from "@/components/ui/icons";
import { signOutAction } from "@/lib/auth/actions";
import { clubNavigation } from "@/lib/club/navigation";
import { cn } from "@/lib/cn";
import { CLUB_NAME, HUB_NAME } from "@/lib/constants";

type ClubSidebarProps = {
  clubName: string;
  onNavigate?: () => void;
};

export function ClubSidebar({ clubName, onNavigate }: ClubSidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col border-r border-line bg-white">
      <Link
        href="/verein/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-3 px-5 py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        <Logo className="h-10 w-auto" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[14px] font-semibold text-ink">
            {clubName || CLUB_NAME}
          </span>
          <span className="block text-[10px] font-medium tracking-[0.12em] text-navy/55 uppercase">
            {HUB_NAME}
          </span>
        </span>
      </Link>

      <nav aria-label="Verein" className="mt-1 flex-1 px-3">
        <ul className="space-y-1">
          {clubNavigation.map((item) => {
            const active =
              "exact" in item && item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-[12px] font-semibold tracking-[0.1em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
                    active
                      ? "bg-brand-yellow text-navy"
                      : "text-ink/70 hover:bg-navy/4 hover:text-ink",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line px-3 py-4">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[12px] font-semibold tracking-[0.1em] text-ink/70 uppercase transition-colors hover:bg-navy/4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            <IconLogout className="h-4 w-4" />
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}

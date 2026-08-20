"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { IconClose, IconMenu } from "@/components/ui/icons";
import { signOutAction } from "@/lib/auth/actions";
import { canAccessAdmin, canAccessClub, homePathForRole } from "@/lib/auth/roles";
import { CLUB_NAME, HUB_NAME } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { mainNavigation } from "@/lib/navigation";
import { userRoleLabel } from "@/lib/admin";
import type { AuthSession } from "@/types/auth";

type HeaderProps = {
  variant?: "overlay" | "solid";
  session?: AuthSession | null;
};

export function Header({ variant = "overlay", session = null }: HeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setAccountOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const account = getAccountLinks(session);

  return (
    <header
      className={cn(
        "relative z-40",
        variant === "solid" && "bg-navy",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-8 lg:py-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          <Logo preload />
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold text-white sm:text-base">
              {CLUB_NAME}
            </span>
            <span className="block text-[10px] font-medium tracking-[0.12em] text-brand-yellow uppercase">
              {HUB_NAME}
            </span>
          </span>
        </Link>

        <nav
          aria-label="Hauptnavigation"
          className="hidden flex-1 items-center justify-center lg:flex"
        >
          <ul className="flex items-center gap-5 xl:gap-7">
            {mainNavigation.map((item) => {
              const active = pathname === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "text-[12px] font-medium tracking-[0.1em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow",
                      active
                        ? "text-brand-yellow"
                        : "text-white/72 hover:text-white",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span
                      className={cn(
                        "border-b pb-1",
                        active ? "border-brand-yellow" : "border-transparent",
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {account ? (
            <div className="relative">
              <button
                type="button"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((current) => !current)}
                className="inline-flex h-9 items-center border border-white/35 px-3.5 text-[12px] font-medium tracking-[0.1em] text-white uppercase transition-colors hover:border-white/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                Mein Bereich
              </button>
              {accountOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 border border-line bg-white py-2 shadow-[0_8px_24px_rgba(16,20,28,0.12)]"
                >
                  <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    {userRoleLabel[session!.user.role]}
                  </p>
                  <AccountLinks
                    dashboardHref={account.dashboardHref}
                    profileHref={account.profileHref}
                    onNavigate={() => setAccountOpen(false)}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center border border-white/35 px-3.5 text-[12px] font-medium tracking-[0.1em] text-white uppercase transition-colors hover:border-white/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              Login
            </Link>
          )}
          <Link
            href="/bewerben"
            className="inline-flex h-9 items-center bg-brand-yellow px-3.5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase transition-colors hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Turnier bewerben →
          </Link>
        </div>

        <button
          type="button"
          className="ml-auto inline-flex h-11 w-11 items-center justify-center text-white lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <IconClose className="h-6 w-6" /> : <IconMenu className="h-6 w-6" />}
          <span className="sr-only">{open ? "Menü schließen" : "Menü öffnen"}</span>
        </button>
      </div>

      <div
        id="mobile-navigation"
        hidden={!open}
        className={cn(
          "fixed inset-0 z-50 bg-navy lg:hidden",
          open ? "block" : "hidden",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <Logo />
            <span className="text-[15px] font-semibold text-white">
              {CLUB_NAME}
            </span>
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            onClick={() => setOpen(false)}
          >
            <IconClose className="h-6 w-6" />
            <span className="sr-only">Menü schließen</span>
          </button>
        </div>

        <nav aria-label="Mobile Navigation" className="px-6 py-8">
          <ul className="flex flex-col gap-5">
            {mainNavigation.map((item) => {
              const active = pathname === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "text-xl font-medium tracking-[0.08em] uppercase",
                      active ? "text-brand-yellow" : "text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-10 flex flex-col gap-3">
            {account ? (
              <>
                <Link
                  href={account.dashboardHref}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center border border-white/35 text-sm font-medium tracking-[0.08em] text-white uppercase"
                >
                  Mein Bereich
                </Link>
                <Link
                  href={account.profileHref}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center border border-white/35 text-sm font-medium tracking-[0.08em] text-white uppercase"
                >
                  Profil
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="inline-flex h-11 w-full items-center justify-center border border-white/35 text-sm font-medium tracking-[0.08em] text-white uppercase"
                  >
                    Abmelden
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center justify-center border border-white/35 text-sm font-medium tracking-[0.08em] text-white uppercase"
              >
                Login
              </Link>
            )}
            <Link
              href="/bewerben"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center justify-center bg-brand-yellow text-sm font-semibold tracking-[0.08em] text-navy uppercase"
            >
              Turnier bewerben →
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

function getAccountLinks(session: AuthSession | null) {
  if (!session) {
    return null;
  }

  if (canAccessAdmin(session.user.role)) {
    return {
      dashboardHref: homePathForRole(session.user.role),
      profileHref: "/admin/profil",
    };
  }

  if (canAccessClub(session.user.role)) {
    return {
      dashboardHref: homePathForRole(session.user.role),
      profileHref: "/verein/profil",
    };
  }

  return {
    dashboardHref: "/",
    profileHref: "/",
  };
}

function AccountLinks({
  dashboardHref,
  profileHref,
  onNavigate,
}: {
  dashboardHref: string;
  profileHref: string;
  onNavigate: () => void;
}) {
  const linkClassName =
    "block px-3 py-2 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

  return (
    <>
      <Link href={dashboardHref} className={linkClassName} onClick={onNavigate}>
        Dashboard
      </Link>
      <Link href={profileHref} className={linkClassName} onClick={onNavigate}>
        Profil
      </Link>
      <Link href="/" className={linkClassName} onClick={onNavigate}>
        Öffentliche Website
      </Link>
      <form action={signOutAction}>
        <button type="submit" className={`${linkClassName} w-full text-left`}>
          Abmelden
        </button>
      </form>
    </>
  );
}

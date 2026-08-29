"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";
import { CLUB_NAME, HUB_NAME } from "@/lib/constants";
import { adminNavigation } from "@/lib/admin-navigation";
import { canSeeAdminNavItem } from "@/lib/rbac/admin-access";
import type { Permission } from "@/types/rbac";

type AdminSidebarProps = {
  onNavigate?: () => void;
  effectivePermissions: Permission[];
  isSuperAdmin: boolean;
};

export function AdminSidebar({
  onNavigate,
  effectivePermissions,
  isSuperAdmin,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const permissionSet = new Set(effectivePermissions);
  const visibleNavigation = adminNavigation.filter((item) =>
    canSeeAdminNavItem(item.href, permissionSet, isSuperAdmin),
  );

  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex items-center gap-3 px-5 py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        <Logo className="h-10 w-auto" />
        <span className="leading-tight">
          <span className="block text-[14px] font-semibold">{CLUB_NAME}</span>
          <span className="block text-[10px] font-medium tracking-[0.12em] text-brand-yellow uppercase">
            {HUB_NAME}
          </span>
        </span>
      </Link>

      <nav aria-label="Admin" className="mt-2 flex-1 px-3">
        <ul className="space-y-1">
          {visibleNavigation.map((item) => {
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
                      : "text-white/72 hover:bg-white/6 hover:text-white",
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

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-white/40 uppercase">
          Interner Bereich
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex text-[12px] font-semibold tracking-[0.08em] text-white/72 uppercase transition-colors hover:text-brand-yellow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          Zur Website →
        </Link>
      </div>
    </div>
  );
}

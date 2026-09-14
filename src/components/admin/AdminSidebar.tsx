"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";
import { CLUB_NAME, HUB_NAME } from "@/lib/constants";
import { adminNavigationGroups } from "@/lib/admin-navigation";
import { canSeeAdminNavItem } from "@/lib/rbac/admin-access";
import type { Permission } from "@/types/rbac";

type AdminSidebarProps = {
  onNavigate?: () => void;
  effectivePermissions: Permission[];
  isSuperAdmin: boolean;
};

function isNavItemActive(pathname: string, href: string, exact?: boolean) {
  if (exact) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({
  onNavigate,
  effectivePermissions,
  isSuperAdmin,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const permissionSet = new Set(effectivePermissions);

  const visibleGroups = adminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canSeeAdminNavItem(item.href, permissionSet, isSuperAdmin),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex items-center gap-3 px-5 py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        <Logo className="h-10 w-auto" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[14px] font-semibold">{CLUB_NAME}</span>
          <span className="block text-[10px] font-medium tracking-[0.12em] text-brand-yellow uppercase">
            {HUB_NAME}
          </span>
        </span>
      </Link>

      <nav aria-label="Admin" className="mt-1 flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-5">
          {visibleGroups.map((group) => (
            <div
              key={group.id}
              className={cn(
                group.accountSection && "mt-2 border-t border-white/10 pt-5",
              )}
            >
              <p className="px-3 text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
                {group.label}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item.href, item.exact);
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
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words leading-snug">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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

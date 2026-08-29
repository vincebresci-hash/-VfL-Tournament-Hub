"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { cn } from "@/lib/cn";
import { ADMIN_HOME } from "@/lib/auth/roles";
import { getAdminRoutePermissions, hasEffectivePermission } from "@/lib/rbac/admin-access";
import type { Permission } from "@/types/rbac";

type AdminShellProps = {
  children: ReactNode;
  effectivePermissions: Permission[];
  isSuperAdmin: boolean;
};

export function AdminShell({
  children,
  effectivePermissions,
  isSuperAdmin,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const permissionSet = useMemo(
    () => new Set(effectivePermissions),
    [effectivePermissions],
  );

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (pathname === "/admin/login") {
      return;
    }

    const required = getAdminRoutePermissions(pathname);
    if (!required || required.length === 0) {
      return;
    }

    if (isSuperAdmin) {
      return;
    }

    const allowed = required.some((permission) =>
      hasEffectivePermission(permissionSet, permission, false),
    );

    if (!allowed) {
      router.replace(ADMIN_HOME);
    }
  }, [pathname, effectivePermissions, isSuperAdmin, router, permissionSet]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full bg-background lg:flex">
      <aside id="admin-sidebar" className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <AdminSidebar
            effectivePermissions={effectivePermissions}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-navy/50 lg:hidden",
          open ? "block" : "hidden",
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <AdminSidebar
          onNavigate={() => setOpen(false)}
          effectivePermissions={effectivePermissions}
          isSuperAdmin={isSuperAdmin}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader open={open} onToggle={() => setOpen((current) => !current)} />
        <main id="inhalt" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

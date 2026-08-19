"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ClubHeader } from "@/components/club/ClubHeader";
import { ClubSidebar } from "@/components/club/ClubSidebar";
import { cn } from "@/lib/cn";

type ClubShellProps = {
  clubName: string;
  usingDemoData?: boolean;
  children: ReactNode;
};

export function ClubShell({
  clubName,
  usingDemoData = false,
  children,
}: ClubShellProps) {
  const [open, setOpen] = useState(false);

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

  return (
    <div className="min-h-full bg-background lg:flex">
      <aside id="club-sidebar" className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <ClubSidebar clubName={clubName} />
        </div>
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-navy/40 lg:hidden",
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
        <ClubSidebar clubName={clubName} onNavigate={() => setOpen(false)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <ClubHeader
          open={open}
          clubName={clubName}
          onToggle={() => setOpen((current) => !current)}
        />
        <main id="inhalt" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {usingDemoData ? (
            <p className="mb-6 border border-brand-yellow/50 bg-brand-yellow/18 px-4 py-3 text-[13px] leading-6 text-ink">
              Bewerbungen und Teams sind noch Beispieldaten, bis die SQL-Migration
              im Supabase SQL Editor ausgeführt wurde.
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

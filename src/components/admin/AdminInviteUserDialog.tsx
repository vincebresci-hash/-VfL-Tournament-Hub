"use client";

import { useState } from "react";
import { AdminInviteUserForm } from "@/components/admin/AdminInviteUserForm";
import {
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSectionTitleClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import type { RbacRole } from "@/types/rbac";

type ClubOption = { id: string; name: string };
type TeamOption = {
  id: string;
  name: string;
  ageGroup: string | null;
  clubId: string;
  clubName: string;
};

type AdminInviteUserDialogProps = {
  roles: RbacRole[];
  clubs: ClubOption[];
  teams: TeamOption[];
};

export function AdminInviteUserDialog({ roles, clubs, teams }: AdminInviteUserDialogProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={adminPrimaryButtonClass}
      >
        Benutzer einladen
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8">
      <div className={`w-full max-w-2xl ${adminCardShellClass} p-4 sm:p-6`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className={adminSectionTitleClass}>
              Benutzer einladen
            </h2>
            <p className="mt-2 text-[14px] text-muted">
              Es wird eine sichere Einladungs-E-Mail über Supabase Auth versendet. Keine
              Passwörter im Adminbereich.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
          >
            Schließen
          </button>
        </div>
        <AdminInviteUserForm
          roles={roles}
          clubs={clubs}
          teams={teams}
          onClose={() => setOpen(false)}
        />
      </div>
    </div>
  );
}

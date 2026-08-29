"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import {
  AdminCard,
  AdminInfo,
  AdminNotice,
  displayValue,
} from "@/components/admin/AdminPanel";
import { AdminUserPermissionsCard } from "@/components/admin/AdminUsersBoard";
import { userRoleLabel } from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import {
  assignUserRoleAction,
  revokeUserRoleAction,
  setUserActiveAction,
  updateManagedUserProfileAction,
} from "@/lib/rbac/actions";
import type { AdminUserSummary } from "@/types/rbac";
import type { RbacRole, RbacRoleKey } from "@/types/rbac";

type AdminUserDetailProps = {
  user: AdminUserSummary;
  roles: RbacRole[];
  canManageUsers: boolean;
  canManageRoles: boolean;
};

export function AdminUserDetail({
  user,
  roles,
  canManageUsers,
  canManageRoles,
}: AdminUserDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [selectedRole, setSelectedRole] = useState<RbacRoleKey | "">("");

  async function handleProfileSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await updateManagedUserProfileAction({
      userId: user.id,
      firstName,
      lastName,
      displayName,
      phone,
      jobTitle,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice("Profil gespeichert.");
    router.refresh();
  }

  async function handleToggleActive() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await setUserActiveAction(user.id, !user.isActive);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(user.isActive ? "Benutzer deaktiviert." : "Benutzer aktiviert.");
    router.refresh();
  }

  const assignedRoleKeys = new Set(
    user.roles.map((role) => `${role.key}:${role.clubId ?? "platform"}`),
  );
  const assignableRoles = roles.filter((role) => {
    const scope = role.isPlatformRole ? "platform" : user.clubId ?? "club-missing";
    return !assignedRoleKeys.has(`${role.key}:${role.isPlatformRole ? "platform" : scope}`);
  });

  async function handleAssignRole() {
    if (!selectedRole) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await assignUserRoleAction({
      userId: user.id,
      roleKey: selectedRole,
      clubId: selectedRole === "CLUB_ADMIN" || selectedRole === "TEAM_MANAGER" ? user.clubId : null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice("Rolle zugewiesen.");
    setSelectedRole("");
    router.refresh();
  }

  async function handleRevokeRole(roleKey: RbacRoleKey, clubId: string | null) {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await revokeUserRoleAction({
      userId: user.id,
      roleKey,
      clubId,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice("Rolle entfernt.");
    router.refresh();
  }

  return (
    <div className="mt-8 grid gap-6">
      {error ? (
        <AdminNotice>
          <span className="text-[#9a2b2b]">{error}</span>
        </AdminNotice>
      ) : null}
      {notice ? <AdminNotice>{notice}</AdminNotice> : null}

      <AdminCard title="Stammdaten">
        <dl className="grid gap-4 sm:grid-cols-2">
          <AdminInfo label="E-Mail" value={user.email} />
          <AdminInfo label="Profilrolle" value={userRoleLabel[user.profileRole]} />
          <AdminInfo label="Verein" value={displayValue(user.clubName)} />
          <AdminInfo
            label="Status"
            value={user.isActive ? "Aktiv" : "Inaktiv"}
          />
          <AdminInfo
            label="Account seit"
            value={formatDateDe(user.createdAt.slice(0, 10))}
          />
        </dl>
      </AdminCard>

      {canManageUsers ? (
        <form
          className="border border-line bg-white p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void handleProfileSave();
          }}
        >
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Profil bearbeiten
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="user-first-name" label="Vorname">
              <TextInput
                id="user-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
            <Field id="user-last-name" label="Nachname">
              <TextInput
                id="user-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
            <Field id="user-display-name" label="Anzeigename">
              <TextInput
                id="user-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <Field id="user-job-title" label="Funktion">
              <TextInput
                id="user-job-title"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </Field>
            <Field id="user-phone" label="Telefon">
              <TextInput
                id="user-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-6 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-70"
          >
            {saving ? "Wird gespeichert…" : "Profil speichern"}
          </button>
        </form>
      ) : null}

      <AdminCard title="Zugewiesene Rollen">
        <p className="mb-3 text-[13px] text-muted">
          Mehrere Rollen können gleichzeitig aktiv sein. Jede Rolle erweitert die effektiven
          Berechtigungen.
        </p>
        {user.roles.length === 0 ? (
          <p className="text-[14px] text-muted">Keine RBAC-Rollen zugewiesen.</p>
        ) : (
          <ul className="space-y-2">
            {user.roles.map((role) => (
              <li
                key={`${role.key}-${role.clubId ?? "platform"}`}
                className="flex items-center justify-between border border-line px-3 py-2"
              >
                <span className="text-[14px] text-ink">
                  {role.name}
                  {role.clubId ? " (vereinsbezogen)" : ""}
                </span>
                {canManageRoles ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleRevokeRole(role.key, role.clubId)}
                    className="text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase"
                  >
                    Entfernen
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      {canManageRoles ? (
        <AdminCard title="Rolle zuweisen">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field id="assign-role" label="Rolle">
              <select
                id="assign-role"
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value as RbacRoleKey | "")}
                className="h-11 w-full border border-line bg-white px-3 text-[14px] text-ink"
              >
                <option value="">Rolle wählen…</option>
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={saving || !selectedRole}
              onClick={() => void handleAssignRole()}
              className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase hover:bg-navy-soft disabled:opacity-70"
            >
              Zuweisen
            </button>
          </div>
          <p className="mt-3 text-[13px] leading-6 text-muted">
            Super-Admin-Zuweisungen sind nur für Super-Admins möglich. Vereinsrollen
            benötigen eine Vereinszuordnung im Profil.
          </p>
        </AdminCard>
      ) : null}

      {canManageRoles ? (
        <AdminCard title="Kontostatus">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleToggleActive()}
            className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:bg-background disabled:opacity-70"
          >
            {user.isActive ? "Benutzer deaktivieren" : "Benutzer aktivieren"}
          </button>
        </AdminCard>
      ) : null}

      <AdminUserPermissionsCard user={user} />

      {user.teamAssignments.length > 0 ? (
        <AdminCard title="Teamzuweisungen">
          <ul className="space-y-2">
            {user.teamAssignments.map((assignment) => (
              <li key={assignment.teamId} className="border border-line px-3 py-2 text-[14px]">
                {assignment.teamName}
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </div>
  );
}

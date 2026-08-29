"use client";

import Image from "next/image";
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
  cancelInvitationAction,
  resendInvitationAction,
} from "@/lib/rbac/invitation-actions";
import {
  assignTeamToUserAction,
  assignUserRoleAction,
  revokeTeamFromUserAction,
  revokeUserRoleAction,
  setUserActiveAction,
  updateManagedUserProfileAction,
  updateUserClubAssignmentAction,
} from "@/lib/rbac/actions";
import { ROLE_EXPLANATIONS } from "@/lib/rbac/role-labels";
import type { AdminAuditEntry, AdminUserSummary } from "@/types/rbac";
import type { RbacRole, RbacRoleKey } from "@/types/rbac";

type ClubOption = { id: string; name: string };
type TeamOption = {
  id: string;
  name: string;
  ageGroup: string | null;
  clubId: string;
  clubName: string;
};

type AdminUserDetailProps = {
  user: AdminUserSummary;
  roles: RbacRole[];
  clubs: ClubOption[];
  teams: TeamOption[];
  auditEntries: AdminAuditEntry[];
  canManageUsers: boolean;
  canManageRoles: boolean;
  canManageTeams: boolean;
};

function accountStatusLabel(status: AdminUserSummary["accountStatus"]) {
  switch (status) {
    case "active":
      return "Aktiv";
    case "inactive":
      return "Deaktiviert";
    case "invitation_pending":
      return "Einladung ausstehend";
  }
}

export function AdminUserDetail({
  user,
  roles,
  clubs,
  teams,
  auditEntries,
  canManageUsers,
  canManageRoles,
  canManageTeams,
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
  const [clubId, setClubId] = useState(user.clubId ?? "");
  const [selectedRole, setSelectedRole] = useState<RbacRoleKey | "">("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const displayNameValue =
    user.displayName?.trim() || `${user.firstName} ${user.lastName}`.trim() || user.email;

  const assignedRoleKeys = new Set(
    user.roles.map((role) => `${role.key}:${role.clubId ?? "platform"}`),
  );
  const assignableRoles = roles.filter((role) => {
    const scope = role.isPlatformRole ? "platform" : user.clubId ?? clubId ?? "club-missing";
    return !assignedRoleKeys.has(`${role.key}:${role.isPlatformRole ? "platform" : scope}`);
  });

  const assignableTeams = teams.filter(
    (team) =>
      !user.teamAssignments.some((assignment) => assignment.teamId === team.id) &&
      (!clubId || team.clubId === clubId),
  );

  async function runAction(action: () => Promise<{ error: string | null }>, success: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await action();
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(success);
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

      {user.accountStatus === "invitation_pending" ? (
        <AdminNotice>
          Die Einladung wurde versendet und noch nicht angenommen.
          {canManageRoles && user.invitationId ? (
            <span className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void runAction(
                    () => resendInvitationAction(user.invitationId!),
                    "Einladung erneut gesendet.",
                  )
                }
                className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
              >
                Einladung erneut senden
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void runAction(
                    () => cancelInvitationAction(user.invitationId!),
                    "Einladung abgebrochen.",
                  )
                }
                className="text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase"
              >
                Einladung abbrechen
              </button>
            </span>
          ) : null}
        </AdminNotice>
      ) : null}

      {user.roles.length === 0 && user.accountStatus !== "invitation_pending" ? (
        <AdminNotice>
          Deinem Konto wurde noch keine Rolle zugewiesen. Bitte wende dich an einen
          Administrator.
        </AdminNotice>
      ) : null}

      <AdminCard title="Profil">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="relative h-20 w-20 overflow-hidden border border-line bg-background">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt=""
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted">
                {displayNameValue.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <dl className="grid flex-1 gap-4 sm:grid-cols-2">
            <AdminInfo label="E-Mail" value={user.email} />
            <AdminInfo label="Profilrolle" value={userRoleLabel[user.profileRole]} />
            <AdminInfo label="Verein" value={displayValue(user.clubName)} />
            <AdminInfo label="Status" value={accountStatusLabel(user.accountStatus)} />
            <AdminInfo
              label="Account seit"
              value={formatDateDe(user.createdAt.slice(0, 10))}
            />
            <AdminInfo label="Telefon" value={displayValue(user.phone)} />
            <AdminInfo label="Funktion" value={displayValue(user.jobTitle)} />
          </dl>
        </div>
      </AdminCard>

      {canManageUsers ? (
        <form
          className="border border-line bg-white p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void runAction(
              () =>
                updateManagedUserProfileAction({
                  userId: user.id,
                  firstName,
                  lastName,
                  displayName,
                  phone,
                  jobTitle,
                }),
              "Profil gespeichert.",
            );
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

      {canManageRoles ? (
        <AdminCard title="Vereinszuordnung">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field id="user-club" label="Verein">
              <select
                id="user-club"
                value={clubId}
                onChange={(event) => setClubId(event.target.value)}
                className="h-11 w-full border border-line bg-white px-3 text-[14px] text-ink"
              >
                <option value="">Kein Verein</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void runAction(
                  () =>
                    updateUserClubAssignmentAction({
                      userId: user.id,
                      clubId: clubId || null,
                    }),
                  "Vereinszuordnung gespeichert.",
                )
              }
              className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase"
            >
              Speichern
            </button>
          </div>
        </AdminCard>
      ) : null}

      <AdminCard title="Rollen & Rechte">
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
                className="flex items-start justify-between gap-3 border border-line px-3 py-3"
              >
                <span>
                  <span className="block text-[14px] font-medium text-ink">
                    {ROLE_EXPLANATIONS[role.key]?.title ?? role.name}
                  </span>
                  <span className="mt-1 block text-[13px] text-muted">
                    {ROLE_EXPLANATIONS[role.key]?.description}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted/80">{role.key}</span>
                </span>
                {canManageRoles ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void runAction(
                        () =>
                          revokeUserRoleAction({
                            userId: user.id,
                            roleKey: role.key,
                            clubId: role.clubId,
                          }),
                        "Rolle entfernt.",
                      )
                    }
                    className="shrink-0 text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase"
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
                    {ROLE_EXPLANATIONS[role.key]?.title ?? role.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={saving || !selectedRole}
              onClick={() =>
                void runAction(
                  () =>
                    assignUserRoleAction({
                      userId: user.id,
                      roleKey: selectedRole as RbacRoleKey,
                      clubId:
                        selectedRole === "CLUB_ADMIN" || selectedRole === "TEAM_MANAGER"
                          ? clubId || user.clubId
                          : null,
                    }),
                  "Rolle zugewiesen.",
                )
              }
              className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase"
            >
              Zuweisen
            </button>
          </div>
        </AdminCard>
      ) : null}

      <AdminCard title="Teams">
        {user.teamAssignments.length === 0 ? (
          <p className="text-[14px] text-muted">
            Dir ist aktuell noch keine Mannschaft zugewiesen.
          </p>
        ) : (
          <ul className="space-y-2">
            {user.teamAssignments.map((assignment) => (
              <li
                key={assignment.teamId}
                className="flex items-center justify-between border border-line px-3 py-2"
              >
                <span className="text-[14px] text-ink">
                  {assignment.teamName}
                  {assignment.ageGroup ? ` · ${assignment.ageGroup}` : ""}
                  {assignment.clubName ? ` · ${assignment.clubName}` : ""}
                </span>
                {canManageTeams ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void runAction(
                        () =>
                          revokeTeamFromUserAction({
                            userId: user.id,
                            teamId: assignment.teamId,
                          }),
                        "Team entfernt.",
                      )
                    }
                    className="text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase"
                  >
                    Entfernen
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManageTeams && assignableTeams.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field id="assign-team" label="Team zuweisen">
              <select
                id="assign-team"
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
                className="h-11 w-full border border-line bg-white px-3 text-[14px] text-ink"
              >
                <option value="">Team wählen…</option>
                {assignableTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                    {team.ageGroup ? ` · ${team.ageGroup}` : ""} · {team.clubName}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              disabled={saving || !selectedTeamId}
              onClick={() =>
                void runAction(
                  () =>
                    assignTeamToUserAction({
                      userId: user.id,
                      teamId: selectedTeamId,
                    }),
                  "Team zugewiesen.",
                )
              }
              className="inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase"
            >
              Team zuweisen
            </button>
          </div>
        ) : null}
      </AdminCard>

      {canManageRoles ? (
        <AdminCard title="Kontostatus">
          <button
            type="button"
            disabled={saving || user.accountStatus === "invitation_pending"}
            onClick={() =>
              void runAction(
                () => setUserActiveAction(user.id, !user.isActive),
                user.isActive ? "Benutzer deaktiviert." : "Benutzer aktiviert.",
              )
            }
            className="inline-flex h-11 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:bg-background disabled:opacity-70"
          >
            {user.isActive ? "Benutzer deaktivieren" : "Benutzer aktivieren"}
          </button>
        </AdminCard>
      ) : null}

      <AdminUserPermissionsCard user={user} />

      {auditEntries.length > 0 ? (
        <AdminCard title="Audit-Protokoll">
          <ul className="space-y-2">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="border border-line px-3 py-2 text-[13px] text-ink">
                <span className="font-medium">{entry.action}</span>
                <span className="text-muted">
                  {" "}
                  · {formatDateDe(entry.createdAt.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </div>
  );
}

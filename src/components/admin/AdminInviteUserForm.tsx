"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Field, TextAreaInput, TextInput } from "@/components/apply/FormControls";
import { AdminNotice, adminMobileCardClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/AdminPanel";
import { inviteUserAction } from "@/lib/rbac/invitation-actions";
import { ROLE_EXPLANATIONS } from "@/lib/rbac/role-labels";
import type { RbacRole, RbacRoleKey } from "@/types/rbac";

type ClubOption = { id: string; name: string };
type TeamOption = {
  id: string;
  name: string;
  ageGroup: string | null;
  clubId: string;
  clubName: string;
};

type AdminInviteUserFormProps = {
  roles: RbacRole[];
  clubs: ClubOption[];
  teams: TeamOption[];
  onClose: () => void;
};

const CLUB_ROLES: RbacRoleKey[] = ["CLUB_ADMIN", "TEAM_MANAGER"];

export function AdminInviteUserForm({
  roles,
  clubs,
  teams,
  onClose,
}: AdminInviteUserFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clubId, setClubId] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<RbacRoleKey[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [personalMessage, setPersonalMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const availableTeams = useMemo(
    () => (clubId ? teams.filter((team) => team.clubId === clubId) : teams),
    [clubId, teams],
  );

  function toggleRole(roleKey: RbacRoleKey) {
    setSelectedRoles((current) =>
      current.includes(roleKey)
        ? current.filter((key) => key !== roleKey)
        : [...current, roleKey],
    );
  }

  function toggleTeam(teamId: string) {
    setSelectedTeams((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const result = await inviteUserAction({
      email,
      firstName,
      lastName,
      displayName,
      clubId: clubId || null,
      roleKeys: selectedRoles,
      teamIds: selectedTeams,
      personalMessage,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice("Einladung wurde versendet.");
    router.refresh();
    setTimeout(onClose, 1200);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
      {error ? (
        <AdminNotice>
          <span className="text-[#9a2b2b]">{error}</span>
        </AdminNotice>
      ) : null}
      {notice ? <AdminNotice>{notice}</AdminNotice> : null}

      <Field id="invite-email" label="E-Mail *">
        <TextInput
          id="invite-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="invite-first-name" label="Vorname">
          <TextInput
            id="invite-first-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </Field>
        <Field id="invite-last-name" label="Nachname">
          <TextInput
            id="invite-last-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </Field>
      </div>

      <Field id="invite-display-name" label="Anzeigename">
        <TextInput
          id="invite-display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </Field>

      <Field id="invite-club" label="Verein">
        <select
          id="invite-club"
          value={clubId}
          onChange={(event) => {
            setClubId(event.target.value);
            setSelectedTeams([]);
          }}
          className="h-10 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          <option value="">Kein Verein</option>
          {clubs.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
          Rollen *
        </legend>
        <div className="mt-3 grid gap-2">
          {roles.map((role) => (
            <label
              key={role.id}
              className={`flex cursor-pointer items-start gap-3 ${adminMobileCardClass}`}
            >
              <input
                type="checkbox"
                checked={selectedRoles.includes(role.key)}
                onChange={() => toggleRole(role.key)}
                className="mt-1"
              />
              <span>
                <span className="block text-[14px] font-medium text-ink">
                  {ROLE_EXPLANATIONS[role.key]?.title ?? role.name}
                </span>
                <span className="mt-1 block text-[13px] text-muted">
                  {ROLE_EXPLANATIONS[role.key]?.description ?? role.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {selectedRoles.some((key) => CLUB_ROLES.includes(key)) && !clubId ? (
        <AdminNotice>
          <span className="text-[#9a2b2b]">
            Vereinsrollen erfordern eine Vereinszuordnung.
          </span>
        </AdminNotice>
      ) : null}

      {availableTeams.length > 0 ? (
        <fieldset>
          <legend className="text-[11px] font-semibold tracking-[0.1em] text-ink uppercase">
            Teams
          </legend>
          <div className="mt-3 grid gap-2">
            {availableTeams.map((team) => (
              <label
                key={team.id}
                className={`flex cursor-pointer items-center gap-3 ${adminMobileCardClass} py-2.5`}
              >
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(team.id)}
                  onChange={() => toggleTeam(team.id)}
                />
                <span className="text-[14px] text-ink">
                  {team.name}
                  {team.ageGroup ? ` · ${team.ageGroup}` : ""} · {team.clubName}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Field id="invite-message" label="Persönliche Nachricht (optional)">
        <TextAreaInput
          id="invite-message"
          value={personalMessage}
          onChange={(event) => setPersonalMessage(event.target.value)}
          placeholder="Optionale Nachricht in der Einladungs-E-Mail"
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving || selectedRoles.length === 0}
          className={adminPrimaryButtonClass}
        >
          {saving ? "Wird gesendet…" : "Einladung senden"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={adminSecondaryButtonClass}
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}

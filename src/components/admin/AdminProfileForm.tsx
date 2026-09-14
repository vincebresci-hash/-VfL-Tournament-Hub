"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import {
  AdminInfo,
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  displayValue,
} from "@/components/admin/AdminPanel";
import { userRoleLabel } from "@/lib/admin";
import { formatDateDe, formatDateTimeDe } from "@/lib/format";
import {
  updateAdminProfileAction,
  updatePasswordAction,
} from "@/lib/auth/actions";
import type { UserProfile } from "@/types/auth";

type AdminProfileFormProps = {
  profile: UserProfile;
};

function profileInitials(profile: UserProfile, fallbackName: string) {
  const fromParts = `${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}`.trim();
  if (fromParts) {
    return fromParts.toUpperCase();
  }
  const fromName = fallbackName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return fromName || "?";
}

export function AdminProfileForm({ profile }: AdminProfileFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [nextPasswordConfirm, setNextPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const displayNameValue =
    displayName.trim() || `${firstName} ${lastName}`.trim();
  const initials = profileInitials(profile, displayNameValue);

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileNotice(null);

    const result = await updateAdminProfileAction({
      firstName,
      lastName,
      displayName,
      phone,
      jobTitle,
    });
    setSavingProfile(false);

    if (result.error) {
      setProfileError(result.error);
      return;
    }

    setProfileNotice("Profil gespeichert.");
    router.refresh();
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    setPasswordNotice(null);

    const result = await updatePasswordAction({
      currentPassword,
      nextPassword,
      nextPasswordConfirm,
    });
    setSavingPassword(false);

    if (result.error) {
      setPasswordError(result.error);
      return;
    }

    setCurrentPassword("");
    setNextPassword("");
    setNextPasswordConfirm("");
    setPasswordNotice("Passwort geändert.");
  }

  return (
    <div className="grid gap-4">
      {/* Account overview / hero */}
      <section
        className={`${adminCardShellClass} border-l-4 border-l-brand-yellow p-4 sm:p-5`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-navy font-display text-lg font-bold tracking-wide text-brand-yellow"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold tracking-wide text-ink uppercase sm:text-2xl">
              {displayValue(displayNameValue)}
            </h2>
            <p className="mt-1 break-all text-[14px] text-muted">{profile.email}</p>
            <p className="mt-2 text-[12px] font-semibold tracking-[0.06em] text-navy uppercase">
              {userRoleLabel[profile.role]}
              {jobTitle ? ` · ${jobTitle}` : ""}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-x-5 gap-y-3.5 border-t border-line/70 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminInfo label="Name" value={displayValue(displayNameValue)} />
          <AdminInfo label="E-Mail" value={profile.email} />
          <AdminInfo label="Rolle" value={userRoleLabel[profile.role]} />
          <AdminInfo label="Funktion" value={displayValue(jobTitle)} />
          <AdminInfo label="Telefon" value={displayValue(phone)} />
          <AdminInfo
            label="Konto seit"
            value={formatDateDe(profile.createdAt.slice(0, 10))}
          />
          <AdminInfo
            label="Letzter Login"
            value={profile.lastSignInAt ? formatDateTimeDe(profile.lastSignInAt) : "—"}
          />
        </dl>
      </section>

      <form onSubmit={handleProfile} className={`${adminCardShellClass} p-4 sm:p-5`}>
        <h2 className="font-display text-[15px] font-bold tracking-[0.04em] text-ink uppercase sm:text-base">
          Profildaten
        </h2>
        <div className="mt-3 border-t border-line/70 pt-3">
          {profileError ? (
            <p className="text-[14px] text-[#9a2b2b]" role="alert">
              {profileError}
            </p>
          ) : null}
          {profileNotice ? (
            <p className="text-[14px] text-ink">{profileNotice}</p>
          ) : null}
          <div
            className={`grid gap-4 sm:grid-cols-2 ${profileError || profileNotice ? "mt-4" : ""}`}
          >
            <Field id="admin-first-name" label="Vorname">
              <TextInput
                id="admin-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
            <Field id="admin-last-name" label="Nachname">
              <TextInput
                id="admin-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
            <Field id="admin-display-name" label="Anzeigename">
              <TextInput
                id="admin-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <Field id="admin-job-title" label="Funktion">
              <TextInput
                id="admin-job-title"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </Field>
            <Field id="admin-phone" label="Telefon">
              <TextInput
                id="admin-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
          </div>
          <div className="mt-5">
            <button
              type="submit"
              disabled={savingProfile}
              className={adminPrimaryButtonClass}
            >
              {savingProfile ? "Wird gespeichert…" : "Profil speichern"}
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={handlePassword} className={`${adminCardShellClass} p-4 sm:p-5`}>
        <h2 className="font-display text-[15px] font-bold tracking-[0.04em] text-ink uppercase sm:text-base">
          Passwort & Sicherheit
        </h2>
        <div className="mt-3 border-t border-line/70 pt-3">
          <p className="max-w-xl text-[13px] leading-5 text-muted">
            Das Passwort wird ausschließlich über Supabase Auth gespeichert.
          </p>
          {passwordError ? (
            <p className="mt-3 text-[14px] text-[#9a2b2b]" role="alert">
              {passwordError}
            </p>
          ) : null}
          {passwordNotice ? (
            <p className="mt-3 text-[14px] text-ink">{passwordNotice}</p>
          ) : null}
          <div className="mt-4 grid gap-4">
            <Field id="current-password" label="Aktuelles Passwort">
              <TextInput
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="next-password" label="Neues Passwort">
                <TextInput
                  id="next-password"
                  type="password"
                  autoComplete="new-password"
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </Field>
              <Field id="next-password-confirm" label="Neues Passwort wiederholen">
                <TextInput
                  id="next-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={nextPasswordConfirm}
                  onChange={(event) => setNextPasswordConfirm(event.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="mt-5">
            <button
              type="submit"
              disabled={savingPassword}
              className={adminSecondaryButtonClass}
            >
              {savingPassword ? "Wird gespeichert…" : "Passwort ändern"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

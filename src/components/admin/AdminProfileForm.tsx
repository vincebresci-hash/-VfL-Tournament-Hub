"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { AdminCard, AdminInfo, displayValue } from "@/components/admin/AdminPanel";
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
    <div className="grid gap-6">
      <AdminCard title="Konto">
        <dl className="grid gap-4 sm:grid-cols-2">
          <AdminInfo label="Name" value={displayValue(displayNameValue)} />
          <AdminInfo label="E-Mail" value={profile.email} />
          <AdminInfo label="Rolle" value={userRoleLabel[profile.role]} />
          <AdminInfo label="Funktion" value={displayValue(jobTitle)} />
          <AdminInfo label="Telefon" value={displayValue(phone)} />
          <AdminInfo label="Account seit" value={formatDateDe(profile.createdAt.slice(0, 10))} />
          <AdminInfo
            label="Letzter Login"
            value={profile.lastSignInAt ? formatDateTimeDe(profile.lastSignInAt) : "—"}
          />
          <AdminInfo label="Anzeigename" value={displayValue(displayNameValue)} />
        </dl>
      </AdminCard>

      <form onSubmit={handleProfile} className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Profil bearbeiten
        </h2>
        {profileError ? (
          <p className="mt-4 text-[14px] text-[#9a2b2b]" role="alert">
            {profileError}
          </p>
        ) : null}
        {profileNotice ? (
          <p className="mt-4 text-[14px] text-ink">{profileNotice}</p>
        ) : null}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
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
        <button
          type="submit"
          disabled={savingProfile}
          className="mt-6 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] disabled:opacity-70"
        >
          {savingProfile ? "Wird gespeichert…" : "Profil speichern"}
        </button>
      </form>

      <form onSubmit={handlePassword} className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Passwort ändern
        </h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted">
          Das Passwort wird ausschließlich über Supabase Auth gespeichert.
        </p>
        {passwordError ? (
          <p className="mt-4 text-[14px] text-[#9a2b2b]" role="alert">
            {passwordError}
          </p>
        ) : null}
        {passwordNotice ? (
          <p className="mt-4 text-[14px] text-ink">{passwordNotice}</p>
        ) : null}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="current-password" label="Aktuelles Passwort">
            <TextInput
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <div />
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
        <button
          type="submit"
          disabled={savingPassword}
          className="mt-6 inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase hover:bg-navy-soft disabled:opacity-70"
        >
          {savingPassword ? "Wird gespeichert…" : "Passwort ändern"}
        </button>
      </form>
    </div>
  );
}

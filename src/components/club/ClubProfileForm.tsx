"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { updatePersonalProfileAction } from "@/lib/auth/actions";
import { updateClubProfileAction } from "@/lib/club/actions";
import type { ClubWorkspace } from "@/lib/club/workspace";

type ClubProfileFormProps = {
  workspace: ClubWorkspace;
};

export function ClubProfileForm({ workspace }: ClubProfileFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(workspace.user.firstName);
  const [lastName, setLastName] = useState(workspace.user.lastName);
  const [displayName, setDisplayName] = useState(workspace.user.displayName ?? "");
  const [phone, setPhone] = useState(workspace.user.phone ?? "");
  const [jobTitle, setJobTitle] = useState(workspace.user.jobTitle ?? "");
  const [name, setName] = useState(workspace.club.name);
  const [city, setCity] = useState(workspace.club.city);
  const [website, setWebsite] = useState(workspace.club.website ?? "");
  const [clubPhone, setClubPhone] = useState(workspace.club.contactPhone ?? "");
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [personalNotice, setPersonalNotice] = useState<string | null>(null);
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubNotice, setClubNotice] = useState<string | null>(null);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingClub, setSavingClub] = useState(false);

  async function handlePersonalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPersonal(true);
    setPersonalError(null);
    setPersonalNotice(null);

    const result = await updatePersonalProfileAction({
      firstName,
      lastName,
      displayName,
      phone,
      jobTitle,
      avatarUrl: workspace.user.avatarUrl,
    });

    setSavingPersonal(false);

    if (result.error) {
      setPersonalError(result.error);
      return;
    }

    setPersonalNotice("Persönliches Profil gespeichert.");
    router.refresh();
  }

  async function handleClubSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingClub(true);
    setClubError(null);
    setClubNotice(null);

    const result = await updateClubProfileAction({
      name,
      city,
      website,
      contactPhone: clubPhone,
    });

    setSavingClub(false);

    if (result.error) {
      setClubError(result.error);
      return;
    }

    setClubNotice("Vereinsprofil gespeichert.");
    router.refresh();
  }

  const displayNameValue =
    displayName.trim() || `${firstName} ${lastName}`.trim() || workspace.user.email;

  return (
    <div className="grid gap-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
          Profil
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
          Persönliche Angaben und Vereinsdaten getrennt verwalten.
        </p>
      </div>

      <form
        onSubmit={handlePersonalSubmit}
        className="border border-line bg-white p-5 sm:p-6"
      >
        <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
          Mein Profil
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted">
          Diese Angaben gelten für dein persönliches Benutzerkonto.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="personal-first-name" label="Vorname">
            <TextInput
              id="personal-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </Field>
          <Field id="personal-last-name" label="Nachname">
            <TextInput
              id="personal-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </Field>
          <Field id="personal-display-name" label="Anzeigename">
            <TextInput
              id="personal-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field id="personal-job-title" label="Funktion">
            <TextInput
              id="personal-job-title"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </Field>
          <Field id="personal-email" label="E-Mail">
            <TextInput
              id="personal-email"
              type="email"
              defaultValue={workspace.user.email}
              readOnly
            />
          </Field>
          <Field id="personal-phone" label="Telefon">
            <TextInput
              id="personal-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        </div>
        {personalError ? (
          <p className="mt-4 text-[13px] text-[#9a2b2b]" role="alert">
            {personalError}
          </p>
        ) : null}
        {personalNotice ? (
          <p className="mt-4 text-[13px] text-muted">{personalNotice}</p>
        ) : null}
        <button
          type="submit"
          disabled={savingPersonal}
          className="mt-6 inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-70"
        >
          {savingPersonal ? "Wird gespeichert…" : "Profil speichern"}
        </button>
      </form>

      <form
        onSubmit={handleClubSubmit}
        className="grid gap-8 border border-line bg-white p-5 sm:p-6 lg:grid-cols-[8rem_minmax(0,1fr)]"
      >
        <div>
          <p className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
            Logo
          </p>
          {workspace.club.logo ? (
            <Image
              src={workspace.club.logo}
              alt={`Logo ${workspace.club.name}`}
              width={96}
              height={96}
              unoptimized
              className="mt-3 h-24 w-24 bg-transparent object-contain"
            />
          ) : (
            <div className="mt-3 flex h-24 w-24 items-center justify-center border border-dashed border-navy/25 bg-transparent">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
                Logo
              </span>
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase">
            Verein
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted">
            Vereinsdaten für Bewerbungen und die öffentliche Darstellung.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="profile-club" label="Vereinsname">
              <TextInput
                id="profile-club"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field id="profile-city" label="Ort">
              <TextInput
                id="profile-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </Field>
            <Field id="profile-website" label="Website">
              <TextInput
                id="profile-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </Field>
            <Field id="profile-contact" label="Ansprechpartner">
              <TextInput id="profile-contact" value={displayNameValue} readOnly />
            </Field>
            <Field id="profile-phone" label="Vereinstelefon">
              <TextInput
                id="profile-phone"
                value={clubPhone}
                onChange={(event) => setClubPhone(event.target.value)}
              />
            </Field>
          </div>
          {clubError ? (
            <p className="mt-4 text-[13px] text-[#9a2b2b]" role="alert">
              {clubError}
            </p>
          ) : null}
          {clubNotice ? (
            <p className="mt-4 text-[13px] text-muted">{clubNotice}</p>
          ) : null}
          <button
            type="submit"
            disabled={savingClub}
            className="mt-6 inline-flex h-11 items-center bg-navy px-4 text-[12px] font-semibold tracking-[0.08em] text-white uppercase hover:bg-navy-soft disabled:opacity-70"
          >
            {savingClub ? "Wird gespeichert…" : "Verein speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}

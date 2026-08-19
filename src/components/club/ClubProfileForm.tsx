"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { updateClubProfileAction } from "@/lib/club/actions";
import type { ClubWorkspace } from "@/lib/club/workspace";

type ClubProfileFormProps = {
  workspace: ClubWorkspace;
};

export function ClubProfileForm({ workspace }: ClubProfileFormProps) {
  const router = useRouter();
  const contactName = `${workspace.user.firstName} ${workspace.user.lastName}`.trim();
  const [name, setName] = useState(workspace.club.name);
  const [city, setCity] = useState(workspace.club.city);
  const [website, setWebsite] = useState(workspace.club.website ?? "");
  const [phone, setPhone] = useState(workspace.club.contactPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = await updateClubProfileAction({
      name,
      city,
      website,
      contactPhone: phone,
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice("Vereinsprofil gespeichert.");
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        Vereinsprofil
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-muted">
        Diese Angaben können später automatisch in neue Bewerbungen übernommen
        werden. Ein Logo-Upload folgt mit der echten Speicherung.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-8 border border-line bg-white p-5 sm:p-6 lg:grid-cols-[8rem_minmax(0,1fr)]"
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

        <div className="grid gap-5 sm:grid-cols-2">
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
            <TextInput id="profile-contact" defaultValue={contactName} readOnly />
          </Field>
          <Field id="profile-email" label="E-Mail">
            <TextInput
              id="profile-email"
              type="email"
              defaultValue={workspace.user.email}
              readOnly
            />
          </Field>
          <Field id="profile-phone" label="Telefon">
            <TextInput
              id="profile-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="sm:col-span-2 text-[13px] text-[#9a2b2b]" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="sm:col-span-2 text-[13px] text-muted">{notice}</p>
          ) : null}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase disabled:opacity-70"
            >
              {submitting ? "Wird gespeichert…" : "Speichern"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

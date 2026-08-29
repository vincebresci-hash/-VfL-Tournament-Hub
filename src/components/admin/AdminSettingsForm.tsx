"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, SelectInput, TextInput } from "@/components/apply/FormControls";
import { applicationStatusLabel } from "@/lib/admin";
import { saveAppSettingsAction } from "@/lib/db/admin-actions";
import { MANUAL_ADMIN_APPLICATION_STATUSES } from "@/types/application";
import type { AppSettings } from "@/types/admin";

type AdminSettingsFormProps = {
  settings: AppSettings;
};

function ToggleField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 border border-line px-4 py-3">
      <span className="text-[14px] text-ink">{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-brand-yellow"
      />
    </label>
  );
}

export function AdminSettingsForm({ settings }: AdminSettingsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const result = await saveAppSettingsAction(values);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice("Einstellungen gespeichert.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-8">
      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Allgemein
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="platform-name" label="Plattformname">
            <TextInput
              id="platform-name"
              value={values.platformName}
              onChange={(event) =>
                setValues((current) => ({ ...current, platformName: event.target.value }))
              }
            />
          </Field>
          <Field id="organizer-name" label="Veranstaltername">
            <TextInput
              id="organizer-name"
              value={values.organizerName}
              onChange={(event) =>
                setValues((current) => ({ ...current, organizerName: event.target.value }))
              }
            />
          </Field>
          <Field id="contact-email" label="Kontakt-E-Mail">
            <TextInput
              id="contact-email"
              type="email"
              value={values.contactEmail}
              onChange={(event) =>
                setValues((current) => ({ ...current, contactEmail: event.target.value }))
              }
            />
          </Field>
          <Field id="contact-phone" label="Kontakt-Telefon">
            <TextInput
              id="contact-phone"
              value={values.contactPhone}
              onChange={(event) =>
                setValues((current) => ({ ...current, contactPhone: event.target.value }))
              }
            />
          </Field>
        </div>
      </section>

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Bewerbungen
        </h2>
        <div className="mt-5 grid gap-3">
          <ToggleField
            id="applications-enabled"
            label="Bewerbungen global aktivieren"
            checked={values.applicationsEnabled}
            onChange={(applicationsEnabled) =>
              setValues((current) => ({ ...current, applicationsEnabled }))
            }
          />
          <ToggleField
            id="waitlist-enabled"
            label="Warteliste aktivieren"
            checked={values.waitlistEnabled}
            onChange={(waitlistEnabled) =>
              setValues((current) => ({ ...current, waitlistEnabled }))
            }
          />
          <ToggleField
            id="confirmation-enabled"
            label="Bewerbungsbestätigung aktivieren"
            checked={values.applicationConfirmationEnabled}
            onChange={(applicationConfirmationEnabled) =>
              setValues((current) => ({ ...current, applicationConfirmationEnabled }))
            }
          />
        </div>
      </section>

      <section className="border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
          Admin
        </h2>
        <div className="mt-5 grid gap-5">
          <ToggleField
            id="dashboard-new"
            label="Neue Bewerbungen im Dashboard anzeigen"
            checked={values.dashboardShowNewApplications}
            onChange={(dashboardShowNewApplications) =>
              setValues((current) => ({ ...current, dashboardShowNewApplications }))
            }
          />
          <Field id="default-status" label="Standardstatus neuer Bewerbungen">
            <SelectInput
              id="default-status"
              value={values.defaultApplicationStatus}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  defaultApplicationStatus: event.target
                    .value as AppSettings["defaultApplicationStatus"],
                }))
              }
            >
              {MANUAL_ADMIN_APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {applicationStatusLabel[status]}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </section>

      {error ? (
        <p className="text-[14px] text-[#9a2b2b]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-[14px] text-ink">{notice}</p> : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60"
        >
          {submitting ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

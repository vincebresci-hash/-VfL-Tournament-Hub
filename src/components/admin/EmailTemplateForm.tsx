"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, SelectInput, TextAreaInput, TextInput } from "@/components/apply/FormControls";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { emailTemplateTypeLabel } from "@/lib/admin";
import {
  createEmailTemplateAction,
  deleteEmailTemplateAction,
  updateEmailTemplateAction,
} from "@/lib/db/admin-actions";
import { EMAIL_TEMPLATE_TYPES, type EmailTemplate, type EmailTemplateInput } from "@/types/admin";

type EmailTemplateFormProps = {
  template?: EmailTemplate;
};

const emptyTemplate: EmailTemplateInput = {
  name: "",
  subject: "",
  body: "",
  type: "general",
  active: true,
};

export function EmailTemplateForm({ template }: EmailTemplateFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<EmailTemplateInput>(
    template
      ? {
          name: template.name,
          subject: template.subject,
          body: template.body,
          type: template.type,
          active: template.active,
        }
      : emptyTemplate,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = template
      ? await updateEmailTemplateAction(template.id, values)
      : await createEmailTemplateAction(values);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/admin/emails");
    router.refresh();
  }

  async function handleDelete() {
    if (!template) {
      return;
    }

    setSubmitting(true);
    const result = await deleteEmailTemplateAction(template.id);
    setSubmitting(false);
    setConfirmDelete(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/admin/emails");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/emails"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        ← Alle Vorlagen
      </Link>

      <h1 className="mt-6 font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        {template ? "Vorlage bearbeiten" : "Neue Vorlage"}
      </h1>
      <p className="mt-2 text-[15px] leading-7 text-muted">
        Platzhalter: {"{{club_name}}"}, {"{{team_name}}"}, {"{{tournament_name}}"}.
        Der Versand selbst folgt später.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-5 border border-line bg-white p-5 sm:p-6">
        <Field id="template-name" label="Name">
          <TextInput
            id="template-name"
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field id="template-type" label="Typ">
          <SelectInput
            id="template-type"
            value={values.type}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                type: event.target.value as EmailTemplateInput["type"],
              }))
            }
          >
            {EMAIL_TEMPLATE_TYPES.map((type) => (
              <option key={type} value={type}>
                {emailTemplateTypeLabel[type]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field id="template-subject" label="Betreff">
          <TextInput
            id="template-subject"
            value={values.subject}
            onChange={(event) =>
              setValues((current) => ({ ...current, subject: event.target.value }))
            }
          />
        </Field>
        <Field
          id="template-body"
          label="Text"
          hint="Noch keine echten E-Mails. Die Vorlage wird nur gespeichert."
        >
          <TextAreaInput
            id="template-body"
            value={values.body}
            onChange={(event) => setValues((current) => ({ ...current, body: event.target.value }))}
            className="min-h-48"
          />
        </Field>
        <label className="flex items-center gap-3 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(event) =>
              setValues((current) => ({ ...current, active: event.target.checked }))
            }
            className="h-4 w-4 accent-brand-yellow"
          />
          Vorlage aktiv
        </label>

        {error ? (
          <p className="text-[14px] text-[#9a2b2b]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          {template ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-10 items-center px-4 text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              Löschen
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60"
          >
            {submitting ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </form>

      <ConfirmModal
        open={confirmDelete}
        title="Vorlage wirklich löschen?"
        confirmLabel="Löschen"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}

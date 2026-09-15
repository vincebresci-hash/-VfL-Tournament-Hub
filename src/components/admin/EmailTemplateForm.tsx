"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, SelectInput, TextAreaInput, TextInput } from "@/components/apply/FormControls";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  AdminPageHeader,
  adminCardShellClass,
  adminDestructiveButtonClass,
  adminPrimaryButtonClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
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
        className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
      >
        ← Alle Vorlagen
      </Link>

      <div className="mt-4">
        <AdminPageHeader
          title={template ? "Vorlage bearbeiten" : "Neue Vorlage"}
          description={'Platzhalter: {{contact_first_name}}, {{contact_last_name}}, {{club_name}}, {{team_name}}, {{tournament_name}}, {{age_group}}, {{tournament_date}}, {{location}}, {{application_status}}.'}
        />
      </div>

      <form onSubmit={handleSubmit} className={`mt-5 grid gap-4 ${adminCardShellClass} p-4 sm:p-5`}>
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
          hint="Platzhalter werden beim Versand automatisch ersetzt."
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
              className={adminDestructiveButtonClass}
            >
              Löschen
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className={adminPrimaryButtonClass}
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

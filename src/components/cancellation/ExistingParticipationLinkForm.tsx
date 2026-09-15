"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, TextInput } from "@/components/apply/FormControls";
import { resolveExistingParticipationLinkAction } from "@/lib/cancellations/participation-recovery-actions";

export function ExistingParticipationLinkForm() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await resolveExistingParticipationLinkAction({ link });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.redirectPath) {
      router.push(result.redirectPath);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Field
        id="existing-participation-link"
        label="Teilnahme-Link"
        hint="Fügt den kompletten Link oder nur den Pfad /teilnahme/… ein."
        error={error ?? undefined}
      >
        <TextInput
          id="existing-participation-link"
          name="link"
          type="text"
          autoComplete="off"
          required
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://…/teilnahme/…"
        />
      </Field>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 items-center justify-center border border-line bg-white px-5 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Wird geprüft …" : "Zum Teilnahme-Link"}
      </button>
    </form>
  );
}

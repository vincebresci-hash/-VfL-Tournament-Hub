"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TeamDirectoryForm } from "@/components/admin/TeamDirectoryForm";
import { getTeamDirectorySavePreviewAction } from "@/lib/team-directory/actions";
import type { TeamDirectoryDuplicateMatch } from "@/types/team-directory";

type TeamDirectorySavePanelProps = {
  applicationId: string;
  canManage: boolean;
};

export function TeamDirectorySavePanel({
  applicationId,
  canManage,
}: TeamDirectorySavePanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<Record<string, unknown> | null>(
    null,
  );
  const [duplicates, setDuplicates] = useState<TeamDirectoryDuplicateMatch[]>([]);

  useEffect(() => {
    if (!open || initialValues) {
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);
      const result = await getTeamDirectorySavePreviewAction(applicationId);
      setLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setInitialValues(result.suggested ?? null);
      setDuplicates(result.duplicates ?? []);
    })();
  }, [applicationId, initialValues, open]);

  if (!canManage) {
    return null;
  }

  return (
    <section className="border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Team-Datenbank
          </h2>
          <p className="mt-2 text-[14px] text-muted">
            Team bewusst als Archiv-/CRM-Datensatz speichern. Die Bewerbung bleibt
            unverändert.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-brand-yellow px-4 py-2 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase"
          >
            In Team-Datenbank übernehmen
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-5">
          {loading ? <p className="text-[14px] text-muted">Vorschau wird geladen…</p> : null}
          {error ? (
            <p className="text-[14px] text-[#9a2b2b]" role="alert">
              {error}
            </p>
          ) : null}
          {duplicates.length > 0 && !loading ? (
            <div className="mb-4 border border-line bg-surface px-4 py-3 text-[13px] text-muted">
              Mögliche vorhandene Einträge:{" "}
              {duplicates.map((duplicate) => (
                <Link
                  key={duplicate.id}
                  href={`/admin/team-datenbank/${duplicate.id}`}
                  className="mr-3 font-semibold text-ink uppercase hover:text-brand-blue"
                >
                  {duplicate.teamName}
                </Link>
              ))}
            </div>
          ) : null}
          {initialValues && !loading ? (
            <TeamDirectoryForm
              initialValues={initialValues}
              submitLabel="In Team-Datenbank speichern"
              onCancel={() => {
                setOpen(false);
                setInitialValues(null);
              }}
              onSuccess={(entryId) => {
                router.push(`/admin/team-datenbank/${entryId}`);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, SelectInput, TextAreaInput, TextInput } from "@/components/apply/FormControls";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  archiveNewsPostAction,
  createNewsPostAction,
  restoreNewsPostAction,
  updateNewsPostAction,
} from "@/lib/db/news-actions";
import {
  getNewsPostStatus,
  newsPostStatusLabel,
  slugifyText,
  toDatetimeLocalValue,
} from "@/lib/news";
import type { AdminTournamentOption } from "@/types/admin";
import type { NewsPost, NewsPostInput, NewsPostSaveMode } from "@/types/news";

type NewsAdminFormProps = {
  post?: NewsPost;
  tournaments: AdminTournamentOption[];
};

const emptyValues: NewsPostInput = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  imageUrl: "",
  publishedAt: "",
  tournamentId: "",
  featured: false,
};

export function NewsAdminForm({ post, tournaments }: NewsAdminFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<NewsPostInput>(
    post
      ? {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          imageUrl: post.imageUrl ?? "",
          publishedAt: toDatetimeLocalValue(post.publishedAt),
          tournamentId: post.tournamentId ?? "",
          featured: post.featured,
        }
      : emptyValues,
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "restore" | null>(null);

  const status = post ? getNewsPostStatus(post) : null;

  function update<K extends keyof NewsPostInput>(key: K, value: NewsPostInput[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };

      if (key === "title" && !slugTouched && !post) {
        next.slug = slugifyText(String(value));
      }

      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>, mode: NewsPostSaveMode) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: NewsPostInput = {
      ...values,
      slug: slugTouched || post ? values.slug : slugifyText(values.title),
    };

    const result = post
      ? await updateNewsPostAction(post.id, payload, mode)
      : await createNewsPostAction(payload, mode);

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (!post && "id" in result && result.id) {
      router.push(`/admin/news/${result.id}/bearbeiten`);
      router.refresh();
      return;
    }

    router.push("/admin/news");
    router.refresh();
  }

  async function handleArchiveToggle() {
    if (!post) {
      return;
    }

    setSubmitting(true);
    const result =
      status === "archived"
        ? await restoreNewsPostAction(post.id)
        : await archiveNewsPostAction(post.id);
    setSubmitting(false);
    setConfirm(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/news"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        ← Alle News
      </Link>

      <h1 className="mt-6 font-display text-3xl font-bold tracking-wide text-ink uppercase sm:text-4xl">
        {post ? "News bearbeiten" : "Neue News"}
      </h1>
      {status ? (
        <p className="mt-2 text-[14px] text-muted">
          Status: {newsPostStatusLabel[status]}
        </p>
      ) : null}

      <form className="mt-8 grid gap-5 border border-line bg-white p-5 sm:p-6">
        <Field id="news-title" label="Titel">
          <TextInput
            id="news-title"
            value={values.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </Field>

        <Field
          id="news-slug"
          label="Slug"
          hint="Wird aus dem Titel erzeugt, kann bei Bedarf angepasst werden."
        >
          <TextInput
            id="news-slug"
            value={values.slug ?? ""}
            onChange={(event) => {
              setSlugTouched(true);
              update("slug", event.target.value);
            }}
          />
        </Field>

        <Field id="news-excerpt" label="Teaser" hint="Maximal 300 Zeichen.">
          <TextAreaInput
            id="news-excerpt"
            value={values.excerpt}
            onChange={(event) => update("excerpt", event.target.value)}
            className="min-h-24"
            maxLength={300}
          />
        </Field>

        <Field id="news-content" label="Inhalt">
          <TextAreaInput
            id="news-content"
            value={values.content}
            onChange={(event) => update("content", event.target.value)}
            className="min-h-56"
          />
        </Field>

        <Field id="news-image-url" label="Bild-URL" optional>
          <TextInput
            id="news-image-url"
            value={values.imageUrl ?? ""}
            onChange={(event) => update("imageUrl", event.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field
          id="news-published-at"
          label="Veröffentlichungsdatum"
          optional
          hint="Leer lassen für sofortige Veröffentlichung beim Klick auf Veröffentlichen."
        >
          <TextInput
            id="news-published-at"
            type="datetime-local"
            value={values.publishedAt ?? ""}
            onChange={(event) => update("publishedAt", event.target.value)}
          />
        </Field>

        <Field id="news-tournament" label="Verknüpftes Turnier" optional>
          <SelectInput
            id="news-tournament"
            value={values.tournamentId ?? ""}
            onChange={(event) => update("tournamentId", event.target.value)}
          >
            <option value="">Kein Turnier</option>
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name} ({tournament.ageGroup})
              </option>
            ))}
          </SelectInput>
        </Field>

        <label className="flex items-center gap-3 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={Boolean(values.featured)}
            onChange={(event) => update("featured", event.target.checked)}
            className="h-4 w-4 accent-brand-yellow"
          />
          Featured (für spätere Homepage-Nutzung)
        </label>

        {error ? (
          <p className="text-[14px] text-[#9a2b2b]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-between gap-3">
          {post ? (
            <button
              type="button"
              onClick={() => setConfirm(status === "archived" ? "restore" : "archive")}
              disabled={submitting}
              className="inline-flex h-10 items-center px-4 text-[12px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60"
            >
              {status === "archived" ? "Wiederherstellen" : "Archivieren"}
            </button>
          ) : (
            <span />
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={(event) => {
                void handleSubmit(event as unknown as FormEvent<HTMLFormElement>, "draft");
              }}
              className="inline-flex h-10 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-60"
            >
              {submitting ? "Speichern…" : "Entwurf speichern"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={(event) => {
                void handleSubmit(event as unknown as FormEvent<HTMLFormElement>, "publish");
              }}
              className="inline-flex h-10 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-60"
            >
              {submitting ? "Speichern…" : "Veröffentlichen"}
            </button>
          </div>
        </div>
      </form>

      <ConfirmModal
        open={confirm === "archive"}
        title="News wirklich archivieren?"
        confirmLabel="Archivieren"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          void handleArchiveToggle();
        }}
      />
      <ConfirmModal
        open={confirm === "restore"}
        title="News wirklich wiederherstellen?"
        confirmLabel="Wiederherstellen"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          void handleArchiveToggle();
        }}
      />
    </div>
  );
}

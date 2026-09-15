"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { removeAvatarAction, uploadAvatarAction } from "@/lib/auth/actions";

type AvatarUploadProps = {
  currentUrl: string | null;
  displayName: string;
  onUploaded?: (url: string) => void;
  onRemoved?: () => void;
  /** When true, shows remove control if an avatar is present. Default true. */
  allowRemove?: boolean;
};

export function AvatarUpload({
  currentUrl,
  displayName,
  onUploaded,
  onRemoved,
  allowRemove = true,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Local override after upload/remove; undefined means use currentUrl prop. */
  const [overrideUrl, setOverrideUrl] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const preview = overrideUrl !== undefined ? overrideUrl : currentUrl;

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set("avatar", file);

    const result = await uploadAvatarAction(formData);
    setUploading(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.avatarUrl) {
      setOverrideUrl(result.avatarUrl);
      onUploaded?.(result.avatarUrl);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);

    const result = await removeAvatarAction();
    setRemoving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOverrideUrl(null);
    onRemoved?.();
  }

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const busy = uploading || removing;

  return (
    <div className="flex items-start gap-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface">
        {preview ? (
          <Image src={preview} alt="" fill className="object-cover" sizes="80px" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-navy font-display text-lg font-bold tracking-wide text-brand-yellow">
            {initials || "?"}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => void handleChange(event)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:border-navy/25 hover:bg-surface disabled:opacity-70"
          >
            {uploading
              ? "Wird hochgeladen…"
              : preview
                ? "Profilbild ändern"
                : "Profilbild hochladen"}
          </button>
          {allowRemove && preview ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove()}
              className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:bg-surface disabled:opacity-70"
            >
              {removing ? "Wird entfernt…" : "Profilbild entfernen"}
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] text-muted">PNG, JPEG oder WebP, max. 1 MB.</p>
        {error ? (
          <p className="mt-2 text-[13px] text-[#9a2b2b]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { uploadAvatarAction } from "@/lib/auth/actions";

type AvatarUploadProps = {
  currentUrl: string | null;
  displayName: string;
  onUploaded?: (url: string) => void;
};

export function AvatarUpload({ currentUrl, displayName, onUploaded }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.avatarUrl) {
      setPreview(result.avatarUrl);
      onUploaded?.(result.avatarUrl);
    }
  }

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-start gap-4">
      <div className="relative h-20 w-20 overflow-hidden border border-line bg-background">
        {preview ? (
          <Image src={preview} alt="" fill className="object-cover" sizes="80px" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted">
            {initials || "?"}
          </div>
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => void handleChange(event)}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-10 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:bg-background disabled:opacity-70"
        >
          {uploading ? "Wird hochgeladen…" : "Profilbild ändern"}
        </button>
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

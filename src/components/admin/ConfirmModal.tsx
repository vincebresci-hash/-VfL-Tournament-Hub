"use client";

import type { ReactNode } from "react";
import {
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSectionTitleClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-navy/45"
        aria-label="Dialog schließen"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className={`relative w-full max-w-md ${adminCardShellClass} p-5 sm:p-6`}
      >
        <h2 id="confirm-title" className={adminSectionTitleClass}>
          {title}
        </h2>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={adminTextLinkClass}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={adminPrimaryButtonClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

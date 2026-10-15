"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { adminCompactSecondaryButtonClass } from "@/components/admin/AdminPanel";
import { InboxAttachmentIcon } from "@/components/admin/inbox/InboxAttachmentIcon";
import {
  abandonUnfinishedInboxReplyAttachmentAction,
  beginInboxReplyAttachmentUploadAction,
  finalizeInboxReplyAttachmentUploadAction,
  listInboxReplyStagingAttachmentsAction,
  removeInboxReplyAttachmentAction,
} from "@/lib/inbox/actions";
import { cn } from "@/lib/cn";
import {
  INBOX_REPLY_ATTACHMENT_ACCEPT,
  composerAttachmentStatusLabel,
  composerAttachmentStepIndex,
  composerAttachmentsBlockSend,
  countActiveComposerAttachments,
  createComposerAttachmentLocalId,
  formatComposerAttachmentValidationErrors,
  formatInboxReplyAttachmentBytes,
  isComposerAttachmentPending,
  mapComposerAttachmentError,
  sumComposerAttachmentBytes,
  validateComposerAttachmentSelection,
  type ComposerAttachmentItem,
} from "@/lib/inbox/reply-attachment-composer";
import {
  decideRemoveAfterAbandon,
  decideRemoveAfterStagingRemove,
  decideStaleFinalizeOutcome,
  decideUnmountAutoCleanup,
} from "@/lib/inbox/reply-attachment-lifecycle";
import {
  INBOX_REPLY_ATTACHMENT_MAX_COUNT,
  INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES,
  INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES,
} from "@/lib/inbox/reply-attachment-limits";
import { uploadInboxReplyAttachmentToSignedUrl } from "@/lib/inbox/reply-attachment-direct-upload";

type InboxReplyAttachmentPanelProps = {
  parentMessageId: string;
  /** When true, picker and remove are locked (send in flight / terminal phases). */
  disabled: boolean;
  onAttachmentsChange: (items: ComposerAttachmentItem[]) => void;
};

type InternalAttachment = ComposerAttachmentItem & {
  /** Kept only for retry; never serialized or logged. */
  file: File | null;
};

/**
 * Phase 4c attachment picker for the Outlook-style reply composer.
 * Uses begin → signed PUT → finalize. Does not enable SMTP attachment send.
 *
 * Staged restore: remount loads actor staging rows for this parent via
 * listInboxReplyStagingAttachmentsAction (see UX note in checks).
 */
export function InboxReplyAttachmentPanel({
  parentMessageId,
  disabled,
  onAttachmentsChange,
}: InboxReplyAttachmentPanelProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const itemsRef = useRef<InternalAttachment[]>([]);
  /** LOW: AbortControllers live in a ref — never React state. */
  const abortByLocalIdRef = useRef<Map<string, AbortController>>(new Map());
  const [items, setItems] = useState<InternalAttachment[]>([]);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>("");
  const [restoring, setRestoring] = useState(true);

  const publish = useCallback(
    (next: InternalAttachment[]) => {
      itemsRef.current = next;
      setItems(next);
      onAttachmentsChange(
        next.map((row) => {
          const { file, ...publicItem } = row;
          void file;
          return publicItem;
        }),
      );
    },
    [onAttachmentsChange],
  );

  const patchItem = useCallback(
    (localId: string, generation: number, patch: Partial<InternalAttachment>) => {
      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }
      const next = itemsRef.current.map((item) => {
        if (item.localId !== localId) {
          return item;
        }
        if (item.status === "removing" && patch.status !== "removing") {
          return item;
        }
        const merged = { ...item, ...patch };
        if (patch.status && patch.status !== item.status) {
          setLiveStatus(
            `${merged.filename}: ${composerAttachmentStatusLabel(patch.status)}`,
          );
        }
        return merged;
      });
      publish(next);
    },
    [publish],
  );

  const abandonUnfinished = useCallback(async (uploadId: string | null) => {
    if (!uploadId) {
      return { ok: true, abandoned: false as boolean };
    }
    try {
      return await abandonUnfinishedInboxReplyAttachmentAction(uploadId);
    } catch {
      return {
        ok: false,
        abandoned: false,
        error: "Aufräumen fehlgeschlagen.",
        errorCode: "cleanup_failed",
      };
    }
  }, []);

  const runUploadPipeline = useCallback(
    async (localId: string, file: File, generation: number) => {
      patchItem(localId, generation, {
        status: "authorizing",
        error: null,
        errorCode: null,
        cleanupPending: false,
      });

      let uploadId: string | null = null;
      const abort = new AbortController();
      abortByLocalIdRef.current.set(localId, abort);

      try {
        const rowMeta = itemsRef.current.find((row) => row.localId === localId);
        const begin = await beginInboxReplyAttachmentUploadAction({
          parentMessageId,
          filename: rowMeta?.filename ?? file.name,
          contentType: rowMeta?.contentType ?? file.type,
          sizeBytes: rowMeta?.sizeBytes ?? file.size,
        });

        if (!mountedRef.current || generation !== generationRef.current) {
          if (begin.authorization?.uploadId) {
            await abandonUnfinished(begin.authorization.uploadId);
          }
          abortByLocalIdRef.current.delete(localId);
          return;
        }

        if (!begin.ok || !begin.authorization) {
          patchItem(localId, generation, {
            status: "failed",
            error: mapComposerAttachmentError(begin.errorCode, begin.error),
            errorCode: begin.errorCode,
          });
          abortByLocalIdRef.current.delete(localId);
          return;
        }

        // Authorization stays in local scope only — never written to React state.
        const authorization = begin.authorization;
        uploadId = authorization.uploadId;
        patchItem(localId, generation, {
          uploadId,
          status: "uploading",
        });

        const put = await uploadInboxReplyAttachmentToSignedUrl(authorization, file, {
          signal: abort.signal,
        });
        if (!mountedRef.current || generation !== generationRef.current) {
          await abandonUnfinished(uploadId);
          abortByLocalIdRef.current.delete(localId);
          return;
        }
        if (!put.ok) {
          if (put.errorCode === "upload_aborted") {
            await abandonUnfinished(uploadId);
            abortByLocalIdRef.current.delete(localId);
            return;
          }
          const abandoned = await abandonUnfinished(uploadId);
          patchItem(localId, generation, {
            status: "failed",
            uploadId: abandoned.abandoned ? null : uploadId,
            cleanupPending: !abandoned.abandoned && !abandoned.ok,
            error: mapComposerAttachmentError(put.errorCode, put.error),
            errorCode: put.errorCode,
          });
          abortByLocalIdRef.current.delete(localId);
          return;
        }

        patchItem(localId, generation, { status: "finalizing" });

        const finalized = await finalizeInboxReplyAttachmentUploadAction(uploadId);
        if (!mountedRef.current || generation !== generationRef.current) {
          // H1: successful finalize must not be deleted by a stale pipeline.
          const stale = decideStaleFinalizeOutcome({
            finalizeOk: Boolean(finalized.ok && finalized.upload),
            serverStatusAfter: finalized.upload?.status ?? null,
          });
          if (stale.action === "abandon_if_still_uploading") {
            await abandonUnfinished(uploadId);
          }
          abortByLocalIdRef.current.delete(localId);
          return;
        }
        if (!finalized.ok || !finalized.upload) {
          const abandoned = await abandonUnfinished(uploadId);
          patchItem(localId, generation, {
            status: "failed",
            uploadId: abandoned.abandoned ? null : uploadId,
            cleanupPending: !abandoned.abandoned && !abandoned.ok,
            error: mapComposerAttachmentError(finalized.errorCode, finalized.error),
            errorCode: finalized.errorCode,
          });
          abortByLocalIdRef.current.delete(localId);
          return;
        }

        patchItem(localId, generation, {
          status: "staged",
          uploadId: finalized.upload.id,
          filename: finalized.upload.filename,
          contentType: finalized.upload.contentType,
          sizeBytes: finalized.upload.sizeBytes,
          file: null,
          error: null,
          errorCode: null,
          cleanupPending: false,
        });
        abortByLocalIdRef.current.delete(localId);
      } catch {
        if (!mountedRef.current || generation !== generationRef.current) {
          await abandonUnfinished(uploadId);
          abortByLocalIdRef.current.delete(localId);
          return;
        }
        const abandoned = await abandonUnfinished(uploadId);
        patchItem(localId, generation, {
          status: "failed",
          uploadId: abandoned.abandoned ? null : uploadId,
          cleanupPending: Boolean(uploadId) && !abandoned.abandoned,
          error: "Upload fehlgeschlagen. Bitte erneut versuchen.",
          errorCode: "upload_failed",
        });
        abortByLocalIdRef.current.delete(localId);
      }
    },
    [abandonUnfinished, parentMessageId, patchItem],
  );

  const enqueueFiles = useCallback(
    (fileList: FileList | File[]) => {
      setBannerError(null);
      const generation = generationRef.current;
      const files = Array.from(fileList);
      if (!files.length) {
        return;
      }

      let working = [...itemsRef.current];
      const accepted: InternalAttachment[] = [];
      const rejections: { filename: string; error: string }[] = [];

      for (const file of files) {
        const validation = validateComposerAttachmentSelection({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          existingCount: countActiveComposerAttachments(working),
          existingTotalBytes: sumComposerAttachmentBytes(working),
        });
        if (!validation.ok) {
          rejections.push({ filename: file.name, error: validation.error });
          continue;
        }
        const row: InternalAttachment = {
          localId: createComposerAttachmentLocalId(),
          parentMessageId,
          filename: validation.filename,
          contentType: validation.contentType,
          sizeBytes: validation.sizeBytes,
          status: "queued",
          uploadId: null,
          error: null,
          errorCode: null,
          cleanupPending: false,
          file,
        };
        working = [...working, row];
        accepted.push(row);
      }

      setBannerError(formatComposerAttachmentValidationErrors(rejections));

      if (!accepted.length) {
        return;
      }

      publish(working);
      for (const row of accepted) {
        if (!row.file) {
          continue;
        }
        void runUploadPipeline(row.localId, row.file, generation);
      }
    },
    [parentMessageId, publish, runUploadPipeline],
  );

  const dropLocalItem = useCallback(
    (localId: string, generation: number, filename: string) => {
      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }
      publish(itemsRef.current.filter((item) => item.localId !== localId));
      setBannerError(null);
      setLiveStatus(`${filename}: entfernt`);
    },
    [publish],
  );

  const reconcileAsStaged = useCallback(
    (
      localId: string,
      generation: number,
      filename: string,
      uploadId: string,
      errorCode: string | null,
      errorMessage: string | null,
    ) => {
      if (!mountedRef.current || generation !== generationRef.current) {
        return;
      }
      // M2: never silently hide a successfully staged upload after remove/finalize race.
      patchItem(localId, generation, {
        status: "staged",
        uploadId,
        file: null,
        cleanupPending: false,
        error: errorMessage,
        errorCode,
      });
      setLiveStatus(
        errorMessage
          ? `${filename}: ${errorMessage}`
          : `${filename}: ${composerAttachmentStatusLabel("staged")}`,
      );
    },
    [patchItem],
  );

  const handleRemove = useCallback(
    async (localId: string) => {
      const generation = generationRef.current;
      const current = itemsRef.current.find((item) => item.localId === localId);
      if (!current || current.status === "removing") {
        return;
      }
      abortByLocalIdRef.current.get(localId)?.abort();
      abortByLocalIdRef.current.delete(localId);
      patchItem(localId, generation, { status: "removing", cleanupPending: true });

      if (current.uploadId) {
        if (current.status === "staged" || current.status === "failed") {
          try {
            const removed = await removeInboxReplyAttachmentAction(current.uploadId);
            if (!removed.ok) {
              if (!mountedRef.current || generation !== generationRef.current) {
                return;
              }
              patchItem(localId, generation, {
                status: current.status === "staged" ? "staged" : "failed",
                cleanupPending: true,
                error: mapComposerAttachmentError(removed.errorCode, removed.error),
                errorCode: removed.errorCode ?? "remove_failed",
              });
              setLiveStatus(
                `${current.filename}: ${mapComposerAttachmentError(removed.errorCode, removed.error)}`,
              );
              return;
            }
          } catch {
            if (!mountedRef.current || generation !== generationRef.current) {
              return;
            }
            patchItem(localId, generation, {
              status: current.status === "staged" ? "staged" : "failed",
              cleanupPending: true,
              error: mapComposerAttachmentError("cleanup_failed", null),
              errorCode: "cleanup_failed",
            });
            return;
          }
        } else {
          // In-flight (queued/authorizing/uploading/finalizing): abandon uploading-only,
          // then reconcile if finalize won (M2).
          const abandoned = await abandonUnfinished(current.uploadId);
          const afterAbandon = decideRemoveAfterAbandon({
            abandonOk: Boolean(abandoned.ok),
            abandoned: Boolean(abandoned.abandoned),
            errorCode:
              "errorCode" in abandoned && typeof abandoned.errorCode === "string"
                ? abandoned.errorCode
                : null,
          });

          if (afterAbandon.action === "keep_with_error") {
            if (!mountedRef.current || generation !== generationRef.current) {
              return;
            }
            // Network/auth failure — keep visible with uploadId; do not claim staged.
            patchItem(localId, generation, {
              status: "failed",
              uploadId: current.uploadId,
              cleanupPending: true,
              error: mapComposerAttachmentError(afterAbandon.errorCode, null),
              errorCode: afterAbandon.errorCode,
            });
            setLiveStatus(
              `${current.filename}: ${mapComposerAttachmentError(afterAbandon.errorCode, null)}`,
            );
            return;
          }

          if (afterAbandon.action === "reconcile_as_staged") {
            reconcileAsStaged(localId, generation, current.filename, current.uploadId, null, null);
            return;
          }

          if (afterAbandon.action === "continue_explicit_staging_remove") {
            try {
              const removed = await removeInboxReplyAttachmentAction(current.uploadId);
              const afterRemove = decideRemoveAfterStagingRemove({
                removeOk: Boolean(removed.ok),
                errorCode: removed.errorCode,
              });
              if (afterRemove.action === "reconcile_as_staged") {
                reconcileAsStaged(
                  localId,
                  generation,
                  current.filename,
                  current.uploadId,
                  afterRemove.errorCode,
                  mapComposerAttachmentError(afterRemove.errorCode, removed.error),
                );
                return;
              }
            } catch {
              reconcileAsStaged(
                localId,
                generation,
                current.filename,
                current.uploadId,
                "cleanup_failed",
                mapComposerAttachmentError("cleanup_failed", null),
              );
              return;
            }
          }
          // drop_from_ui (abandoned or explicit staging remove succeeded)
        }
      }

      dropLocalItem(localId, generation, current.filename);
    },
    [abandonUnfinished, dropLocalItem, patchItem, reconcileAsStaged],
  );

  const handleRetry = useCallback(
    (localId: string) => {
      const generation = generationRef.current;
      const current = itemsRef.current.find((item) => item.localId === localId);
      if (!current?.file || current.status !== "failed") {
        return;
      }
      setBannerError(null);
      // Drop unresolved server id before retrying (best-effort abandon).
      if (current.uploadId) {
        void abandonUnfinished(current.uploadId);
      }
      patchItem(localId, generation, {
        status: "queued",
        error: null,
        errorCode: null,
        uploadId: null,
        cleanupPending: false,
      });
      void runUploadPipeline(localId, current.file, generation);
    },
    [abandonUnfinished, patchItem, runUploadPipeline],
  );

  // Restore staged uploads for this parent after remount (cancel / message return).
  useEffect(() => {
    mountedRef.current = true;
    const generation = generationRef.current;
    const abortMap = abortByLocalIdRef.current;
    let cancelled = false;

    void (async () => {
      setRestoring(true);
      try {
        const listed = await listInboxReplyStagingAttachmentsAction(parentMessageId);
        if (cancelled || !mountedRef.current || generation !== generationRef.current) {
          return;
        }
        if (listed.ok && listed.uploads.length) {
          const restored: InternalAttachment[] = listed.uploads.map((upload) => ({
            localId: createComposerAttachmentLocalId(),
            parentMessageId,
            filename: upload.filename,
            contentType: upload.contentType,
            sizeBytes: upload.sizeBytes,
            status: "staged" as const,
            uploadId: upload.id,
            error: null,
            errorCode: null,
            cleanupPending: false,
            file: null,
          }));
          publish(restored);
          setLiveStatus(
            restored.length === 1
              ? `1 gespeicherter Anhang wiederhergestellt`
              : `${restored.length} gespeicherte Anhänge wiederhergestellt`,
          );
        }
      } finally {
        if (!cancelled && mountedRef.current && generation === generationRef.current) {
          setRestoring(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      generationRef.current = generation + 1;
      for (const controller of abortMap.values()) {
        controller.abort();
      }
      abortMap.clear();
      // H1: only abandon unfinished server rows — never staged/bound.
      const snapshot = itemsRef.current.slice();
      for (const item of snapshot) {
        const decision = decideUnmountAutoCleanup({
          uiStatus: item.status,
          uploadId: item.uploadId,
        });
        if (decision.action === "abandon_if_still_uploading" && item.uploadId) {
          void abandonUnfinishedInboxReplyAttachmentAction(item.uploadId).catch(() => {
            // TTL/purge backstop; never log paths/tokens.
          });
        }
      }
    };
  }, [parentMessageId, publish]);

  const activeCount = countActiveComposerAttachments(items);
  const activeBytes = sumComposerAttachmentBytes(items);
  const atCountLimit = activeCount >= INBOX_REPLY_ATTACHMENT_MAX_COUNT;
  const sendGate = composerAttachmentsBlockSend(items);
  const pickerDisabled = disabled || pickerBusy || atCountLimit || restoring;

  return (
    <div className="rounded-md border border-dashed border-line/70 bg-surface/30 px-3 py-2.5">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
            Anhänge
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            PDF, JPG, PNG, DOCX, XLSX · max.{" "}
            {formatInboxReplyAttachmentBytes(INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES)} / Datei ·{" "}
            {formatInboxReplyAttachmentBytes(INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES)} gesamt ·{" "}
            {INBOX_REPLY_ATTACHMENT_MAX_COUNT} Dateien
          </p>
          <p className="mt-1 text-[12px] text-muted" aria-live="polite">
            {restoring
              ? "Gespeicherte Anhänge werden geladen…"
              : `${activeCount}/${INBOX_REPLY_ATTACHMENT_MAX_COUNT} · ${formatInboxReplyAttachmentBytes(activeBytes)} / ${formatInboxReplyAttachmentBytes(INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES)}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept={INBOX_REPLY_ATTACHMENT_ACCEPT}
            multiple
            disabled={pickerDisabled}
            onChange={(event) => {
              const list = event.target.files;
              setPickerBusy(true);
              try {
                if (list?.length) {
                  enqueueFiles(list);
                }
              } finally {
                event.target.value = "";
                setPickerBusy(false);
              }
            }}
          />
          <button
            type="button"
            className={cn(
              adminCompactSecondaryButtonClass,
              "shrink-0",
              pickerDisabled && "opacity-50",
            )}
            disabled={pickerDisabled}
            aria-controls={items.length ? `${inputId}-list` : undefined}
            aria-label="Anhang hinzufügen, Dateiauswahl"
            title={
              atCountLimit
                ? `Höchstens ${INBOX_REPLY_ATTACHMENT_MAX_COUNT} Anhänge`
                : "Anhang hinzufügen"
            }
            onClick={() => fileInputRef.current?.click()}
          >
            Anhang hinzufügen
          </button>
        </div>
      </div>

      {bannerError ? (
        <p className="mt-2 text-[12px] text-[#9a2b2b]" role="alert">
          {bannerError}
        </p>
      ) : null}

      {sendGate.blocked && items.length > 0 ? (
        <p
          className="mt-2 rounded-md border border-[#c9a227]/35 bg-[#fff8e8] px-2.5 py-1.5 text-[12px] leading-5 text-[#6b5300]"
          role="status"
        >
          {sendGate.reason}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul id={`${inputId}-list`} className="mt-2.5 space-y-1.5" aria-label="Anhangliste">
          {items.map((item) => {
            const pending = isComposerAttachmentPending(item.status);
            const step = composerAttachmentStepIndex(item.status);
            return (
              <li
                key={item.localId}
                className="rounded-md border border-line/60 bg-white px-2.5 py-2"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-muted" aria-hidden>
                    <InboxAttachmentIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatInboxReplyAttachmentBytes(item.sizeBytes)} ·{" "}
                      <span className="font-medium text-ink/70">
                        {composerAttachmentStatusLabel(item.status)}
                        {pending && step.step > 0
                          ? ` (Schritt ${step.step} von ${step.totalSteps})`
                          : ""}
                      </span>
                    </p>
                    {pending ? (
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/50"
                        role="status"
                        aria-label={`${item.filename}: ${step.label}, Schritt ${step.step} von ${step.totalSteps}`}
                      >
                        <div
                          className="h-full rounded-full bg-navy/70 transition-[width] duration-300"
                          style={{
                            width: `${Math.max(8, (step.step / step.totalSteps) * 100)}%`,
                          }}
                        />
                      </div>
                    ) : null}
                    {item.error ? (
                      <p className="mt-1 text-[12px] text-[#9a2b2b]" role="alert">
                        {item.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.status === "failed" && item.file ? (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-navy underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={disabled}
                        onClick={() => handleRetry(item.localId)}
                      >
                        Erneut
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                      disabled={disabled || item.status === "removing"}
                      onClick={() => void handleRemove(item.localId)}
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

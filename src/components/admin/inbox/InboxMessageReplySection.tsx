"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminCompactPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import { InboxReplyComposer } from "@/components/admin/inbox/InboxReplyComposer";
import { InboxReplyList } from "@/components/admin/inbox/InboxReplyList";
import { getInboxMessageDetailAction } from "@/lib/inbox/actions";
import { hasUnresolvedReplyBlocker } from "@/lib/inbox/reply-lifecycle";
import { cn } from "@/lib/cn";
import type {
  InboxMessageDetail as InboxMessageDetailType,
  InboxReplyListItem,
} from "@/lib/inbox/types";

type InboxMessageReplySectionProps = {
  message: InboxMessageDetailType;
  canReply: boolean;
  isPane: boolean;
  /** Driven by parent so the reading layout can shrink while composing. */
  composerOpen: boolean;
  onComposerOpenChange: (open: boolean) => void;
  onDetailReload?: (message: InboxMessageDetailType) => void;
};

/**
 * Prior replies + inline composer for one parent message.
 * Mount with key={message.id} so drafts never follow a selection change.
 */
export function InboxMessageReplySection({
  message,
  canReply,
  isPane,
  composerOpen,
  onComposerOpenChange,
  onDetailReload,
}: InboxMessageReplySectionProps) {
  const [optimisticReply, setOptimisticReply] = useState<InboxReplyListItem | null>(null);
  const mountedRef = useRef(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentMessageId = message.id;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const baseReplies = message.replies ?? [];
  const localReplies =
    optimisticReply && !baseReplies.some((reply) => reply.id === optimisticReply.id)
      ? [optimisticReply, ...baseReplies]
      : baseReplies;

  const hasUnresolvedReply = localReplies.some((reply) =>
    hasUnresolvedReplyBlocker(reply.status),
  );
  const lockedToDisplay = message.fromName
    ? `${message.fromName} <${message.fromAddress}>`
    : message.fromAddress;

  async function refreshDetailAfterReply() {
    const requestedId = parentMessageId;
    const result = await getInboxMessageDetailAction(requestedId);
    if (!mountedRef.current) {
      return;
    }
    if (!result.message || result.message.id !== requestedId) {
      return;
    }
    setOptimisticReply(null);
    onDetailReload?.(result.message);
  }

  return (
    <>
      <div className={cn("shrink-0", isPane ? "mt-3" : "mt-4 sm:mt-5")}>
        <InboxReplyList replies={localReplies} />
      </div>

      {canReply && composerOpen ? (
        <div className={cn("shrink-0 pb-2", isPane ? "mt-3" : "mt-4 sm:mt-5")}>
          <InboxReplyComposer
            parentMessageId={message.id}
            lockedToAddress={message.fromAddress}
            lockedToDisplay={lockedToDisplay}
            originalSubject={message.subject}
            hasUnresolvedReply={hasUnresolvedReply}
            onCancel={() => onComposerOpenChange(false)}
            onOutcome={(result, recorded) => {
              if (!mountedRef.current) {
                return;
              }
              if (recorded) {
                setOptimisticReply(recorded);
              }
              if (result.sendAttempted || result.ok || result.replyId) {
                void refreshDetailAfterReply();
              }
              if (result.ok && result.status === "sent") {
                if (closeTimerRef.current) {
                  clearTimeout(closeTimerRef.current);
                }
                closeTimerRef.current = setTimeout(() => {
                  if (mountedRef.current) {
                    onComposerOpenChange(false);
                  }
                }, 1200);
              }
            }}
          />
        </div>
      ) : null}
    </>
  );
}

export function InboxReplyActionButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        adminCompactPrimaryButtonClass,
        "h-8 rounded-md px-3 text-[10px] tracking-[0.04em]",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      Antworten
    </button>
  );
}

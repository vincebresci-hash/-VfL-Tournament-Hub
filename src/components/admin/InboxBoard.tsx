"use client";

/**
 * Compatibility wrapper around InboxWorkspace (list-only).
 * Prefer importing InboxWorkspace directly from inbox routes.
 */
import { InboxWorkspace } from "@/components/admin/InboxWorkspace";
import type { InboxMessageListItem, InboxProcessingStatus, InboxSyncStateView } from "@/lib/inbox/types";

type InboxBoardProps = {
  messages: InboxMessageListItem[];
  syncState: InboxSyncStateView | null;
  canSync: boolean;
  initialQuery: string;
  initialStatus: InboxProcessingStatus | "all";
  initialUnreadOnly: boolean;
  canManage?: boolean;
};

export function InboxBoard({
  messages,
  syncState,
  canSync,
  initialQuery,
  initialStatus,
  initialUnreadOnly,
  canManage = false,
}: InboxBoardProps) {
  return (
    <InboxWorkspace
      messages={messages}
      syncState={syncState}
      canSync={canSync}
      canManage={canManage}
      initialQuery={initialQuery}
      initialStatus={initialStatus}
      initialUnreadOnly={initialUnreadOnly}
      selectedMessage={null}
    />
  );
}

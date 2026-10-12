import type { InboxProcessingStatus } from "@/lib/inbox/types";
import { INBOX_STATUS_LABEL, inboxStatusBadgeClass } from "@/components/admin/inbox/status";

export function InboxStatusBadge({ status }: { status: InboxProcessingStatus }) {
  return <span className={inboxStatusBadgeClass(status)}>{INBOX_STATUS_LABEL[status]}</span>;
}

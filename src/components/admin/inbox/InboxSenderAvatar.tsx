import { cn } from "@/lib/cn";
import { inboxSenderInitials } from "@/components/admin/inbox/status";

type InboxSenderAvatarProps = {
  fromName: string;
  fromAddress: string;
  unread?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function InboxSenderAvatar({
  fromName,
  fromAddress,
  unread = false,
  size = "md",
  className,
}: InboxSenderAvatarProps) {
  const initials = inboxSenderInitials(fromName, fromAddress);

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide",
        size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-[12px]",
        unread
          ? "bg-brand-yellow text-navy ring-2 ring-brand-yellow/40"
          : "bg-navy/8 text-navy ring-1 ring-inset ring-navy/10",
        className,
      )}
    >
      {initials}
    </span>
  );
}

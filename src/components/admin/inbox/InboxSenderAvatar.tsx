import { cn } from "@/lib/cn";
import { inboxSenderInitials } from "@/components/admin/inbox/status";

type InboxSenderAvatarProps = {
  fromName: string;
  fromAddress: string;
  unread?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-[12px]",
  lg: "h-12 w-12 text-[13px] sm:h-14 sm:w-14 sm:text-[14px]",
} as const;

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
        SIZE_CLASS[size],
        unread
          ? "bg-brand-yellow text-navy shadow-[0_0_0_3px_rgba(255,215,0,0.22)]"
          : "bg-gradient-to-b from-navy/10 to-navy/5 text-navy ring-1 ring-inset ring-navy/10",
        className,
      )}
    >
      {initials}
    </span>
  );
}

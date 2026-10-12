import { cn } from "@/lib/cn";

type InboxAttachmentIconProps = {
  className?: string;
  label?: string;
};

/** Compact paperclip for list rows — decorative; filename shown elsewhere. */
export function InboxAttachmentIcon({
  className,
  label = "Anhang",
}: InboxAttachmentIconProps) {
  return (
    <span
      title={label}
      className={cn("inline-flex text-muted", className)}
      aria-label={label}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
        className="h-3.5 w-3.5"
      >
        <path
          d="M14.5 9.5 8.2 15.8a3.2 3.2 0 1 1-4.5-4.5l7.4-7.4a2.4 2.4 0 0 1 3.4 3.4l-7 7a1.2 1.2 0 1 1-1.7-1.7l6.2-6.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

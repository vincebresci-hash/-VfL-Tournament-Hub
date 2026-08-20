import type { ReactNode } from "react";

export function AuthAlert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <p
      role="alert"
      className={
        tone === "success"
          ? "text-[15px] leading-7 text-ink"
          : "text-[13px] text-[#9a2b2b]"
      }
    >
      {children}
    </p>
  );
}

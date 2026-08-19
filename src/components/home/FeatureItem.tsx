import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type FeatureItemProps = {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
};

export function FeatureItem({
  icon,
  title,
  description,
  className,
}: FeatureItemProps) {
  return (
    <div className={cn("flex min-w-0 items-start gap-2.5", className)}>
      <span className="mt-0.5 inline-flex text-brand-yellow">{icon}</span>
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-white uppercase">
          {title}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-white/62">{description}</p>
      </div>
    </div>
  );
}

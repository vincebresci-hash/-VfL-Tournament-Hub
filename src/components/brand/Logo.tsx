import Image from "next/image";
import { cn } from "@/lib/cn";

type LogoProps = {
  className?: string;
  preload?: boolean;
};

export function Logo({ className, preload = false }: LogoProps) {
  return (
    <Image
      src="/vfl-logo-transparent.png"
      alt=""
      width={600}
      height={600}
      preload={preload}
      unoptimized
      className={cn(
        "w-auto shrink-0 object-contain",
        className ?? "h-12 sm:h-[60px]",
      )}
    />
  );
}

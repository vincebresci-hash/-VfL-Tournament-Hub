import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/cn";

type AuthShellProps = {
  children: ReactNode;
  wide?: boolean;
};

export function AuthShell({ children, wide = false }: AuthShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-navy">
      <Header variant="solid" />
      <main id="inhalt" className="flex-1 bg-navy">
        <Container
          className={cn(
            "flex justify-center py-12 sm:py-16 lg:py-20",
            wide ? "lg:justify-start" : "",
          )}
        >
          <div className={cn("w-full", wide ? "max-w-2xl" : "max-w-[28rem]")}>
            {children}
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-white/12 bg-white p-6 sm:p-8", className)}>
      {children}
    </div>
  );
}

export function AuthHeadline({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      {eyebrow ? (
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-yellow uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-display text-4xl font-bold tracking-wide text-white uppercase sm:text-[2.75rem]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-white/70">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

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

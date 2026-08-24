import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";

type ContentPageProps = {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
};

export function ContentPage({ title, description, children }: ContentPageProps) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="py-12 sm:py-16 lg:py-20">
          <h1 className="font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
            {title}
          </h1>
          {description ? (
            <div className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
              {description}
            </div>
          ) : null}
          {children ? <div className="mt-10">{children}</div> : null}
        </Container>
      </main>
      <Footer />
    </div>
  );
}

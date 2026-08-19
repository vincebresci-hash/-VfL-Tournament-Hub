import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Container } from "@/components/layout/Container";

type PlaceholderPageProps = {
  title: string;
  children?: ReactNode;
};

export function PlaceholderPage({ title, children }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-full flex-col">
      <Header variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="py-20 sm:py-24">
          <h1 className="font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
            {title}
          </h1>
          <div className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
            {children ?? (
              <p>Dieser Bereich wird in einem der nächsten Schritte ergänzt.</p>
            )}
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

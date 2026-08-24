import type { ReactNode } from "react";
import { ContentPage } from "@/components/layout/ContentPage";

type PlaceholderPageProps = {
  title: string;
  children?: ReactNode;
};

export function PlaceholderPage({ title, children }: PlaceholderPageProps) {
  return (
    <ContentPage
      title={title}
      description={
        children ?? (
          <p>Dieser Bereich wird ergänzt, sobald die Inhalte vorliegen.</p>
        )
      }
    />
  );
}

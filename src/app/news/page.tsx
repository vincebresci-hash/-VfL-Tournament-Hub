import type { Metadata } from "next";
import { withCanonical } from "@/lib/site";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const metadata: Metadata = withCanonical("/news", { title: "News" });

export default function NewsPage() {
  return <PlaceholderPage title="News" />;
}

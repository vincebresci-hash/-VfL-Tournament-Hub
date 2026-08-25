import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LivePageView } from "@/components/live/LivePageView";
import { getLivePageData } from "@/lib/db/live-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live",
  description:
    "Aktuelles Turnier live: Spielplan, Ergebnisse, Gruppen und Tabellen im VfL Tournament Hub.",
};

export default async function LivePage() {
  const data = await getLivePageData();

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader variant="solid" />
      <main>
        <LivePageView data={data} />
      </main>
      <Footer />
    </div>
  );
}

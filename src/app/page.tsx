import { HomePageView } from "@/components/home/HomePageView";
import { getLivePageData } from "@/lib/db/live-queries";
import { getAppSettings } from "@/lib/settings";

export default async function Home() {
  const [data, settings] = await Promise.all([
    getLivePageData(),
    getAppSettings(),
  ]);

  return (
    <HomePageView
      data={data}
      applicationsEnabled={settings.applicationsEnabled}
      waitlistEnabled={settings.waitlistEnabled}
    />
  );
}

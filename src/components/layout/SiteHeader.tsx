import { Header } from "@/components/layout/Header";
import { getAuthSession } from "@/lib/auth/session";
import { getHasActiveLiveTournamentToday } from "@/lib/db/live-queries";

type SiteHeaderProps = {
  variant?: "overlay" | "solid";
};

export async function SiteHeader({ variant = "overlay" }: SiteHeaderProps) {
  const [session, liveActive] = await Promise.all([
    getAuthSession(),
    getHasActiveLiveTournamentToday().catch(() => false),
  ]);
  return <Header variant={variant} session={session} liveActive={liveActive} />;
}

import { Header } from "@/components/layout/Header";
import { getAuthSession } from "@/lib/auth/session";

type SiteHeaderProps = {
  variant?: "overlay" | "solid";
};

export async function SiteHeader({ variant = "overlay" }: SiteHeaderProps) {
  const session = await getAuthSession();
  return <Header variant={variant} session={session} />;
}

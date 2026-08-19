import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";
import { canAccessAdmin, isAdminAccessReady } from "@/lib/auth/roles";
import { getPostLoginRedirect, readRedirectParam } from "@/lib/auth/redirects";
import { getAuthSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin Login" };

type AdminLoginPageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = await searchParams;
  const redirectTo = readRedirectParam(params.redirect);
  const session = await getAuthSession();

  if (session && canAccessAdmin(session.user.role) && isAdminAccessReady()) {
    redirect(getPostLoginRedirect(session.user.role, redirectTo));
  }

  return <AdminLoginForm redirectTo={redirectTo} />;
}

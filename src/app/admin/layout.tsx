import type { Metadata } from "next";
import { AdminDataProvider } from "@/components/admin/AdminDataProvider";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Admin | VfL Kirchheim Tournament Hub",
  },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AdminDataProvider>
      <AdminShell>{children}</AdminShell>
    </AdminDataProvider>
  );
}

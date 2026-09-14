import type { Metadata } from "next";
import Link from "next/link";
import { NewsAdminBoard } from "@/components/admin/NewsAdminBoard";
import {
  AdminNotice,
  AdminPageHeader,
  adminPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import { listAdminNewsPosts } from "@/lib/db/news-queries";

export const metadata: Metadata = { title: "News" };

export default async function AdminNewsPage() {
  const { posts, ready } = await listAdminNewsPosts();

  return (
    <div>
      <AdminPageHeader
        title="News"
        description="Aktuelle Informationen zu Turnieren, Spielplänen und Veranstaltungen veröffentlichen."
        actions={
          ready ? (
            <Link href="/admin/news/neu" className={adminPrimaryButtonClass}>
              + Neue News
            </Link>
          ) : undefined
        }
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die neue SQL-Migration im Supabase SQL Editor ausführen, damit
          News gespeichert werden können.
        </AdminNotice>
      ) : (
        <div className="mt-8">
          <NewsAdminBoard posts={posts} />
        </div>
      )}
    </div>
  );
}

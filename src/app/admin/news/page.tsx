import type { Metadata } from "next";
import { NewsAdminBoard } from "@/components/admin/NewsAdminBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listAdminNewsPosts } from "@/lib/db/news-queries";

export const metadata: Metadata = { title: "News" };

export default async function AdminNewsPage() {
  const { posts, ready } = await listAdminNewsPosts();

  return (
    <div>
      <AdminPageHeader
        title="News"
        description="Veröffentliche aktuelle Informationen zu Turnieren, Spielplänen und Veranstaltungen."
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die neue SQL-Migration im Supabase SQL Editor ausführen, damit
          News gespeichert werden können.
        </AdminNotice>
      ) : (
        <NewsAdminBoard posts={posts} />
      )}
    </div>
  );
}

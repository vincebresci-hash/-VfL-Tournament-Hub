import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsAdminForm } from "@/components/admin/NewsAdminForm";
import { getAdminNewsPostById } from "@/lib/db/news-queries";
import { listAdminTournaments } from "@/lib/db/admin-queries";

type AdminEditNewsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: AdminEditNewsPageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getAdminNewsPostById(id);

  return { title: post ? post.title : "News bearbeiten" };
}

export default async function AdminEditNewsPage({ params }: AdminEditNewsPageProps) {
  const { id } = await params;
  const [post, tournaments] = await Promise.all([
    getAdminNewsPostById(id),
    listAdminTournaments(),
  ]);

  if (!post) {
    notFound();
  }

  return <NewsAdminForm post={post} tournaments={tournaments} />;
}

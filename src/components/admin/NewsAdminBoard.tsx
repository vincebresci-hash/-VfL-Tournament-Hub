"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getNewsPostStatus, newsPostStatusLabel } from "@/lib/news";
import { formatDateTimeDe } from "@/lib/format";
import type { NewsPostWithTournament } from "@/types/news";

type NewsAdminBoardProps = {
  posts: NewsPostWithTournament[];
};

function statusClassName(status: ReturnType<typeof getNewsPostStatus>) {
  switch (status) {
    case "published":
      return "text-[#1f6b3f] bg-[#e8f5ee]";
    case "scheduled":
      return "text-[#7a5b12] bg-[#fff6d8]";
    case "archived":
      return "text-muted bg-line/60";
    default:
      return "text-ink bg-background";
  }
}

export function NewsAdminBoard({ posts }: NewsAdminBoardProps) {
  const router = useRouter();

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[14px] leading-6 text-muted">
          Veröffentlichte News erscheinen unter /news. Entwürfe und geplante Beiträge
          bleiben intern.
        </p>
        <Link
          href="/admin/news/neu"
          className="inline-flex h-10 items-center bg-brand-yellow px-4 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          + Neue News
        </Link>
      </div>

      <div className="mt-6 grid gap-3">
        {posts.length === 0 ? (
          <p className="border border-line bg-white px-5 py-8 text-[15px] text-muted">
            Noch keine News vorhanden.
          </p>
        ) : (
          posts.map((post) => {
            const status = getNewsPostStatus(post);

            return (
              <article
                key={post.id}
                className="border border-line bg-white p-5 sm:flex sm:items-start sm:justify-between sm:gap-4"
              >
                <div>
                  <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                    {post.title}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    {post.publishedAt
                      ? `Veröffentlichung: ${formatDateTimeDe(post.publishedAt)}`
                      : "Noch nicht veröffentlicht"}
                  </p>
                  {post.tournamentName ? (
                    <p className="mt-1 text-[13px] text-muted">
                      Turnier: {post.tournamentName}
                    </p>
                  ) : null}
                  <p
                    className={`mt-2 inline-flex px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase ${statusClassName(status)}`}
                  >
                    {newsPostStatusLabel[status]}
                  </p>
                </div>
                <div className="mt-4 flex gap-3 sm:mt-0">
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/news/${post.id}/bearbeiten`)}
                    className="inline-flex h-10 items-center border border-line px-4 text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-navy/20 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                  >
                    Bearbeiten
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

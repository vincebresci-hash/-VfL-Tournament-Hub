"use client";

import { useRouter } from "next/navigation";
import { getNewsPostStatus, newsPostStatusLabel } from "@/lib/news";
import { formatDateTimeDe } from "@/lib/format";
import {
  AdminEmpty,
  adminCardShellClass,
  adminSecondaryButtonClass,
  adminStatusBadgeClass,
} from "@/components/admin/AdminPanel";
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
    <div className="grid gap-2.5">
      {posts.length === 0 ? (
        <AdminEmpty>Noch keine News vorhanden.</AdminEmpty>
      ) : (
        posts.map((post) => {
          const status = getNewsPostStatus(post);

          return (
            <article
              key={post.id}
              className={`${adminCardShellClass} p-4 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:p-5`}
            >
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-lg">
                  {post.title}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {post.publishedAt
                    ? `Veröffentlichung: ${formatDateTimeDe(post.publishedAt)}`
                    : "Noch nicht veröffentlicht"}
                </p>
                {post.tournamentName ? (
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    Turnier: {post.tournamentName}
                  </p>
                ) : null}
                <p
                  className={`mt-2 ${adminStatusBadgeClass} ${statusClassName(status)}`}
                >
                  {newsPostStatusLabel[status]}
                </p>
              </div>
              <div className="mt-4 flex gap-2 sm:mt-0">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/news/${post.id}/bearbeiten`)}
                  className={adminSecondaryButtonClass}
                >
                  Bearbeiten
                </button>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

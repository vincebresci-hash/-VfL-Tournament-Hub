import Link from "next/link";
import { CoverImage } from "@/components/brand/CoverImage";
import { formatDateTimeDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { NewsPostWithTournament } from "@/types/news";

type NewsCardProps = {
  post: NewsPostWithTournament;
};

export function NewsCard({ post }: NewsCardProps) {
  const href = `/news/${post.slug}`;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[12px] border border-line bg-white",
        "shadow-[0_1px_2px_rgba(16,20,28,0.04)]",
        "transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-0.5 hover:border-navy/12 hover:shadow-[0_10px_24px_rgba(16,20,28,0.07)]",
      )}
    >
      <Link
        href={href}
        className="relative block aspect-[16/9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        aria-label={`${post.title} – News lesen`}
      >
        <CoverImage
          src={post.imageUrl ?? undefined}
          alt=""
          className="h-full w-full"
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
        />
      </Link>

      <div className="flex flex-1 flex-col p-5">
        {post.publishedAt ? (
          <time
            dateTime={post.publishedAt}
            className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase"
          >
            {formatDateTimeDe(post.publishedAt)}
          </time>
        ) : null}

        <h2 className="mt-2 font-display text-xl font-bold tracking-wide text-ink uppercase">
          <Link
            href={href}
            className="transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            {post.title}
          </Link>
        </h2>

        <p className="mt-3 line-clamp-3 flex-1 text-[14px] leading-6 text-muted">
          {post.excerpt}
        </p>

        <Link
          href={href}
          className="mt-4 inline-flex text-[12px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
        >
          Weiterlesen →
        </Link>
      </div>
    </article>
  );
}

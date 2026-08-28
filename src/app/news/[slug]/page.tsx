import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverImage } from "@/components/brand/CoverImage";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { getPublishedNewsPostBySlug } from "@/lib/db/news-queries";
import { formatDateTimeDe } from "@/lib/format";
import { getSiteUrl, withCanonical } from "@/lib/site";

type NewsDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: NewsDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedNewsPostBySlug(slug);

  if (!post) {
    return withCanonical(`/news/${slug}`, { title: "News" });
  }

  const pageUrl = `${getSiteUrl()}/news/${slug}`;

  return withCanonical(`/news/${slug}`, {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.publishedAt ?? undefined,
      url: pageUrl,
      images: post.imageUrl ? [{ url: post.imageUrl }] : undefined,
    },
  });
}

export default async function NewsDetailPage({ params }: NewsDetailPageProps) {
  const { slug } = await params;
  const post = await getPublishedNewsPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="py-12 sm:py-16 lg:py-20">
          <Link
            href="/news"
            className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
          >
            ← Alle News
          </Link>

          <article className="mt-8 max-w-3xl">
            {post.publishedAt ? (
              <time
                dateTime={post.publishedAt}
                className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase"
              >
                {formatDateTimeDe(post.publishedAt)}
              </time>
            ) : null}

            <h1 className="mt-3 font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
              {post.title}
            </h1>

            {post.imageUrl ? (
              <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-[12px]">
                <CoverImage
                  src={post.imageUrl}
                  alt=""
                  className="h-full w-full"
                  sizes="(max-width: 768px) 100vw, 768px"
                  preload
                />
              </div>
            ) : null}

            <div className="mt-8 whitespace-pre-wrap text-[16px] leading-8 text-ink">
              {post.content}
            </div>

            {post.tournamentSlug && post.tournamentName ? (
              <p className="mt-8 text-[14px] leading-6 text-muted">
                Zugehöriges Turnier:{" "}
                <Link
                  href={`/turniere/${post.tournamentSlug}`}
                  className="font-semibold text-ink underline decoration-brand-yellow underline-offset-4 hover:text-brand-blue"
                >
                  {post.tournamentName}
                </Link>
              </p>
            ) : null}
          </article>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

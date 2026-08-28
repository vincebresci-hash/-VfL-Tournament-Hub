import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/layout/Container";
import { NewsCard } from "@/components/news/NewsCard";
import { listPublishedNewsPosts } from "@/lib/db/news-queries";
import { withCanonical } from "@/lib/site";

export const metadata: Metadata = withCanonical("/news", {
  title: "News",
  description:
    "Aktuelles rund um unsere Jugendturniere, Spielpläne, Anmeldungen und Veranstaltungen.",
});

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const posts = await listPublishedNewsPosts();

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="solid" />
      <main id="inhalt" className="flex-1 bg-background">
        <Container className="py-12 sm:py-16 lg:py-20">
          <h1 className="font-display text-4xl font-bold tracking-wide text-ink uppercase sm:text-5xl">
            News
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Aktuelles rund um unsere Jugendturniere, Spielpläne, Anmeldungen und
            Veranstaltungen.
          </p>

          {posts.length === 0 ? (
            <p className="mt-10 max-w-xl text-sm leading-6 text-muted">
              Aktuell sind keine News veröffentlicht.
            </p>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <NewsCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </div>
  );
}

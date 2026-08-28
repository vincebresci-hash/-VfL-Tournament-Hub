export type NewsPostStatus = "draft" | "scheduled" | "published" | "archived";

export type NewsPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string | null;
  publishedAt: string | null;
  featured: boolean;
  tournamentId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type NewsPostWithTournament = NewsPost & {
  tournamentName: string | null;
  tournamentSlug: string | null;
};

export type NewsPostInput = {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  tournamentId?: string | null;
  featured?: boolean;
};

export type NewsPostSaveMode = "draft" | "publish";

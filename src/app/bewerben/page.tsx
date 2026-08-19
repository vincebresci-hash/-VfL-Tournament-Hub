import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { formatDateDe } from "@/lib/format";
import { getPublicTournamentBySlug } from "@/lib/tournaments";

export const metadata = { title: "Turnier bewerben" };

type BewerbenPageProps = {
  searchParams: Promise<{ turnier?: string | string[] }>;
};

export default async function BewerbenPage({ searchParams }: BewerbenPageProps) {
  const params = await searchParams;
  const slug = Array.isArray(params.turnier) ? params.turnier[0] : params.turnier;
  const tournament = slug ? getPublicTournamentBySlug(slug) : undefined;

  return (
    <PlaceholderPage title="Turnier bewerben">
      {tournament ? (
        <p>
          Bewerbung für <strong>{tournament.name}</strong> am{" "}
          {formatDateDe(tournament.date)}. Eine Bewerbung ist keine automatische
          Teilnahme. Das Formular folgt im nächsten Schritt.
        </p>
      ) : (
        <p>
          Das Bewerbungsformular für Vereine folgt im nächsten Schritt. Über die
          Startseite kannst du bereits ein konkretes Turnier auswählen.
        </p>
      )}
    </PlaceholderPage>
  );
}

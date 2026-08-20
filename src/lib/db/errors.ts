export function isMissingRelationError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "PGRST202" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

const USER_FACING_DB_MESSAGES = [
  "Bewerbungen für dieses Turnier sind derzeit nicht möglich.",
  "Gastbewerbungen sind nur ohne Anmeldung möglich.",
];

export function toUserFacingDbError(fallback: string, error?: { message?: string } | null) {
  if (isMissingRelationError(error ?? null)) {
    return "Die Datenbank ist noch nicht eingerichtet. Bitte die SQL-Migration im Supabase SQL Editor ausführen.";
  }

  const message = error?.message ?? "";
  for (const known of USER_FACING_DB_MESSAGES) {
    if (message.includes(known)) {
      return known;
    }
  }

  return fallback;
}

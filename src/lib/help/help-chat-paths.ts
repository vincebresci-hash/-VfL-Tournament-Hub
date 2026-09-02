const EXCLUDED_PREFIXES = [
  "/admin",
  "/verein",
  "/teilnahme",
  "/mitteilung",
  "/login",
  "/registrieren",
  "/passwort-vergessen",
  "/passwort-zuruecksetzen",
  "/auth",
  "/bewerben",
] as const;

export function isHelpWidgetPathAllowed(pathname: string) {
  if (!pathname || pathname === "") {
    return true;
  }

  const normalized = pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

  for (const prefix of EXCLUDED_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return false;
    }
  }

  if (normalized.endsWith("/bewerben")) {
    return false;
  }

  return true;
}

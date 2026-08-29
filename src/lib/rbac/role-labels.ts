import type { RbacRoleKey } from "@/types/rbac";

export const ROLE_EXPLANATIONS: Record<
  RbacRoleKey,
  { title: string; description: string }
> = {
  SUPER_ADMIN: {
    title: "Super-Admin",
    description: "Vollzugriff auf alle Bereiche inklusive Benutzer- und Rollenverwaltung.",
  },
  ADMIN: {
    title: "Administrator",
    description: "Breiter Plattformzugriff ohne Rollenverwaltung.",
  },
  TOURNAMENT_MANAGER: {
    title: "Turnierleitung",
    description: "Turniere, Spielpläne und Ergebnisse verwalten.",
  },
  APPLICATION_MANAGER: {
    title: "Bewerbungsmanagement",
    description: "Bewerbungen bearbeiten und über Annahme/Ablehnung entscheiden.",
  },
  FINANCE_MANAGER: {
    title: "Finanzen",
    description: "Zahlungen ansehen und Zahlungsstatus verwalten.",
  },
  COMMUNICATION_MANAGER: {
    title: "Kommunikation",
    description: "E-Mails, Kommunikation und News verwalten.",
  },
  CLUB_ADMIN: {
    title: "Vereinsadmin",
    description: "Verwaltung des eigenen Vereins.",
  },
  TEAM_MANAGER: {
    title: "Team-Manager",
    description: "Zugriff auf zugewiesene Mannschaften.",
  },
};

export function roleExplanation(roleKey: RbacRoleKey) {
  return ROLE_EXPLANATIONS[roleKey];
}

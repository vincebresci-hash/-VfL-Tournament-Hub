import {
  IconClipboard,
  IconClubs,
  IconGrid,
  IconSettings,
  IconTrophy,
  IconUsers,
} from "@/components/ui/icons";

export const clubNavigation = [
  { href: "/verein/dashboard", label: "Übersicht", icon: IconGrid, exact: true },
  { href: "/verein/bewerbungen", label: "Meine Bewerbungen", icon: IconClipboard },
  { href: "/verein/teams", label: "Meine Teams", icon: IconUsers },
  { href: "/verein/profil", label: "Vereinsprofil", icon: IconClubs },
  { href: "/verein/turniere", label: "Turniere", icon: IconTrophy },
  { href: "/verein/einstellungen", label: "Einstellungen", icon: IconSettings },
] as const;

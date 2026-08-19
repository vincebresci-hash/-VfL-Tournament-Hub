import {
  IconClipboard,
  IconClubs,
  IconGrid,
  IconMessage,
  IconSettings,
  IconTrophy,
  IconUsers,
} from "@/components/ui/icons";

export const adminNavigation = [
  { href: "/admin", label: "Dashboard", icon: IconGrid, exact: true },
  { href: "/admin/bewerbungen", label: "Bewerbungen", icon: IconClipboard },
  { href: "/admin/turniere", label: "Turniere", icon: IconTrophy },
  { href: "/admin/vereine", label: "Vereine", icon: IconClubs },
  { href: "/admin/teams", label: "Teams", icon: IconUsers },
  { href: "/admin/emails", label: "E-Mails", icon: IconMessage },
  { href: "/admin/einstellungen", label: "Einstellungen", icon: IconSettings },
] as const;

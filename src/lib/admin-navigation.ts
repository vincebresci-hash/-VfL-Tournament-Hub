import {
  IconClipboard,
  IconClubs,
  IconGrid,
  IconMessage,
  IconNews,
  IconSettings,
  IconTrophy,
  IconUser,
  IconUsers,
} from "@/components/ui/icons";

export const adminNavigation = [
  { href: "/admin", label: "Dashboard", icon: IconGrid, exact: true },
  { href: "/admin/bewerbungen", label: "Bewerbungen", icon: IconClipboard },
  { href: "/admin/turniere", label: "Turniere", icon: IconTrophy },
  { href: "/admin/vereine", label: "Vereine", icon: IconClubs },
  { href: "/admin/teams", label: "Teams", icon: IconUsers },
  { href: "/admin/news", label: "News", icon: IconNews },
  { href: "/admin/emails", label: "E-Mails", icon: IconMessage },
  { href: "/admin/profil", label: "Profil", icon: IconUser },
  { href: "/admin/einstellungen", label: "Einstellungen", icon: IconSettings },
] as const;

import {
  IconClipboard,
  IconClubs,
  IconGrid,
  IconMail,
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
  { href: "/admin/absagen", label: "Absagen", icon: IconClipboard },
  { href: "/admin/turniere", label: "Turniere", icon: IconTrophy },
  { href: "/admin/vereine", label: "Vereine", icon: IconClubs },
  { href: "/admin/teams", label: "Teams", icon: IconUsers },
  { href: "/admin/news", label: "News", icon: IconNews },
  { href: "/admin/kommunikation", label: "Kommunikation", icon: IconMessage },
  { href: "/admin/emails", label: "E-Mails", icon: IconMail },
  { href: "/admin/profil", label: "Profil", icon: IconUser },
  { href: "/admin/einstellungen", label: "Einstellungen", icon: IconSettings },
] as const;

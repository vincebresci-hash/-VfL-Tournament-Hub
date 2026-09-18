import type { ComponentType, SVGProps } from "react";
import {
  IconCancel,
  IconCheckCircle,
  IconClipboard,
  IconClubs,
  IconDatabase,
  IconGrid,
  IconHeart,
  IconMail,
  IconMessage,
  IconNews,
  IconSettings,
  IconShield,
  IconTrophy,
  IconUser,
  IconUsers,
} from "@/components/ui/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export type AdminNavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  exact?: boolean;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  /** Visually separate account/system area at the bottom of the sidebar. */
  accountSection?: boolean;
  items: AdminNavItem[];
};

/**
 * Grouped admin sidebar. Labels are UI-only; hrefs/routes stay stable.
 * Permission filtering uses href via canSeeAdminNavItem — keys unchanged.
 */
export const adminNavigationGroups: AdminNavGroup[] = [
  {
    id: "overview",
    label: "Übersicht",
    items: [{ href: "/admin", label: "Dashboard", icon: IconGrid, exact: true }],
  },
  {
    id: "operations",
    label: "Turnierbetrieb",
    items: [
      { href: "/admin/turniere", label: "Turniere", icon: IconTrophy },
      { href: "/admin/bewerbungen", label: "Bewerbungen", icon: IconClipboard },
      { href: "/admin/absagen", label: "Absagen", icon: IconCancel },
      { href: "/admin/zahlungen", label: "Zahlungen", icon: IconCheckCircle },
    ],
  },
  {
    id: "master-data",
    label: "Stammdaten",
    items: [
      { href: "/admin/vereine", label: "Vereine", icon: IconClubs },
      { href: "/admin/teams", label: "Hub-Teams", icon: IconUsers },
      { href: "/admin/team-datenbank", label: "Team-Datenbank", icon: IconDatabase },
      { href: "/admin/partner", label: "Partner", icon: IconHeart },
    ],
  },
  {
    id: "communication",
    label: "Kommunikation",
    items: [
      { href: "/admin/kommunikation", label: "Nachrichten", icon: IconMessage },
      { href: "/admin/emails", label: "E-Mail-Vorlagen", icon: IconMail },
      { href: "/admin/news", label: "News", icon: IconNews },
    ],
  },
  {
    id: "administration",
    label: "Verwaltung",
    items: [
      { href: "/admin/benutzer", label: "Benutzer", icon: IconUser },
      { href: "/admin/rollen", label: "Rollen", icon: IconShield },
    ],
  },
  {
    id: "account",
    label: "Konto",
    accountSection: true,
    items: [
      { href: "/admin/profil", label: "Profil", icon: IconUser },
      { href: "/admin/einstellungen", label: "Einstellungen", icon: IconSettings },
    ],
  },
];

/** Flat list preserved for checks and any consumers that iterate all items. */
export const adminNavigation: AdminNavItem[] = adminNavigationGroups.flatMap(
  (group) => group.items,
);

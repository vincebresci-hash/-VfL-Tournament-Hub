import type { TurnierhubKnowledgeLink } from "@/lib/help/turnierhub-knowledge";
import {
  getTurnierhubKnowledgeEntries,
  HELP_CHAT_APPLICATION_STATUS_LINKS,
  HELP_CHAT_FALLBACK_LINKS,
  HELP_CHAT_SCHEDULE_REDIRECT_LINKS,
  HELP_CHAT_TOURNAMENT_REDIRECT_LINKS,
} from "@/lib/help/turnierhub-knowledge";

const STATIC_ALLOWED_LINKS = [
  ...HELP_CHAT_FALLBACK_LINKS,
  ...HELP_CHAT_TOURNAMENT_REDIRECT_LINKS,
  ...HELP_CHAT_SCHEDULE_REDIRECT_LINKS,
  ...HELP_CHAT_APPLICATION_STATUS_LINKS,
];

export function isAllowedHelpChatHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return false;
  }

  const lower = href.toLowerCase();
  if (lower.includes("javascript:") || lower.includes("data:")) {
    return false;
  }

  return /^\/[a-z0-9\-/_]*$/i.test(href);
}

export function getAllowedHelpChatLinkHrefs() {
  const hrefs = new Set<string>();

  for (const link of STATIC_ALLOWED_LINKS) {
    if (isAllowedHelpChatHref(link.href)) {
      hrefs.add(link.href);
    }
  }

  for (const entry of getTurnierhubKnowledgeEntries()) {
    for (const link of entry.links ?? []) {
      if (isAllowedHelpChatHref(link.href)) {
        hrefs.add(link.href);
      }
    }
  }

  return hrefs;
}

export function filterAllowedHelpChatLinks(
  links: TurnierhubKnowledgeLink[] | undefined,
) {
  if (!links || links.length === 0) {
    return [];
  }

  const allowed = getAllowedHelpChatLinkHrefs();
  return links.filter(
    (link) => isAllowedHelpChatHref(link.href) && allowed.has(link.href),
  );
}

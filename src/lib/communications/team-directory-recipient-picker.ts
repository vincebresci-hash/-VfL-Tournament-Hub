import type { TeamDirectoryEntry } from "@/types/team-directory";

export type CommunicationEligibleDirectoryEntry = TeamDirectoryEntry;

export type DirectoryRecipientHubFilter = "all" | "hub" | "external";

export type DirectoryRecipientPickerFilters = {
  search: string;
  clubName: string | "all";
  ageGroup: string | "all";
  birthYear: string | "all";
  league: string | "all";
  internalCategory: string | "all";
  internalStrength: string | "all";
  hub: DirectoryRecipientHubFilter;
};

export const DEFAULT_DIRECTORY_RECIPIENT_PICKER_FILTERS: DirectoryRecipientPickerFilters =
  {
    search: "",
    clubName: "all",
    ageGroup: "all",
    birthYear: "all",
    league: "all",
    internalCategory: "all",
    internalStrength: "all",
    hub: "all",
  };

export function hasSendableDirectoryEmail(email: string | null | undefined) {
  return Boolean(email?.trim());
}

export function formatDirectoryContactName(entry: CommunicationEligibleDirectoryEntry) {
  const parts = [entry.contactFirstName, entry.contactLastName]
    .map((value) => value?.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : "—";
}

export function isDirectoryEntrySelectable(entry: CommunicationEligibleDirectoryEntry) {
  return hasSendableDirectoryEmail(entry.contactEmail);
}

export function matchesDirectoryRecipientPickerFilters(
  entry: CommunicationEligibleDirectoryEntry,
  filters: DirectoryRecipientPickerFilters,
): boolean {
  if (filters.clubName !== "all" && entry.clubName !== filters.clubName) {
    return false;
  }

  if (filters.ageGroup !== "all" && entry.ageGroup !== filters.ageGroup) {
    return false;
  }

  if (
    filters.birthYear !== "all" &&
    String(entry.birthYear ?? "") !== filters.birthYear
  ) {
    return false;
  }

  if (filters.league !== "all" && (entry.league ?? "") !== filters.league) {
    return false;
  }

  if (
    filters.internalCategory !== "all" &&
    (entry.internalCategory ?? "") !== filters.internalCategory
  ) {
    return false;
  }

  if (
    filters.internalStrength !== "all" &&
    String(entry.internalStrength ?? "") !== filters.internalStrength
  ) {
    return false;
  }

  if (filters.hub === "hub" && !entry.isHubLinked) {
    return false;
  }

  if (filters.hub === "external" && entry.isHubLinked) {
    return false;
  }

  const query = filters.search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    entry.clubName,
    entry.teamName,
    entry.ageGroup ?? "",
    entry.birthYear != null ? String(entry.birthYear) : "",
    entry.league ?? "",
    entry.internalCategory ?? "",
    entry.contactFirstName ?? "",
    entry.contactLastName ?? "",
    entry.contactEmail ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function filterVisibleDirectoryEntries(
  entries: CommunicationEligibleDirectoryEntry[],
  filters: DirectoryRecipientPickerFilters,
) {
  return entries.filter((entry) => matchesDirectoryRecipientPickerFilters(entry, filters));
}

export function collectUniqueDirectoryFilterValues(
  entries: CommunicationEligibleDirectoryEntry[],
) {
  const clubNames = new Set<string>();
  const ageGroups = new Set<string>();
  const birthYears = new Set<string>();
  const leagues = new Set<string>();
  const internalCategories = new Set<string>();
  const internalStrengths = new Set<string>();

  for (const entry of entries) {
    clubNames.add(entry.clubName);
    if (entry.ageGroup) {
      ageGroups.add(entry.ageGroup);
    }
    if (entry.birthYear != null) {
      birthYears.add(String(entry.birthYear));
    }
    if (entry.league) {
      leagues.add(entry.league);
    }
    if (entry.internalCategory) {
      internalCategories.add(entry.internalCategory);
    }
    if (entry.internalStrength != null) {
      internalStrengths.add(String(entry.internalStrength));
    }
  }

  const sortDe = (left: string, right: string) => left.localeCompare(right, "de");

  return {
    clubNames: [...clubNames].sort(sortDe),
    ageGroups: [...ageGroups].sort(sortDe),
    birthYears: [...birthYears].sort((left, right) => Number(left) - Number(right)),
    leagues: [...leagues].sort(sortDe),
    internalCategories: [...internalCategories].sort(sortDe),
    internalStrengths: [...internalStrengths].sort(
      (left, right) => Number(left) - Number(right),
    ),
  };
}

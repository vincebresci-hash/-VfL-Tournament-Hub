import type { TurnierhubKnowledgeEntry } from "@/lib/help/turnierhub-knowledge";

export const HELP_CHAT_MATCH_THRESHOLD = 4;

const GERMAN_SYNONYMS: Record<string, string[]> = {
  bewerben: ["anmelden", "bewerbung", "anmeldung"],
  warteliste: ["warten", "wartelistenplatz"],
  absage: ["absagen", "stornieren", "zurückziehen"],
  zahlung: ["bezahlen", "gebühr", "startgebühr"],
  spielplan: ["ergebnisse", "tabelle", "gruppen"],
  konto: ["account", "vereinskonto", "login"],
};

export function normalizeHelpChatText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandTokens(tokens: string[]) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    const synonyms = GERMAN_SYNONYMS[token];
    if (synonyms) {
      for (const synonym of synonyms) {
        expanded.add(synonym);
      }
    }
  }

  return expanded;
}

function tokenize(value: string) {
  return normalizeHelpChatText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function scoreEntry(query: string, queryTokens: Set<string>, entry: TurnierhubKnowledgeEntry) {
  let score = 0;
  const normalizedTitle = normalizeHelpChatText(entry.title);

  if (query.includes(normalizedTitle)) {
    score += 12;
  }

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizeHelpChatText(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    if (query === normalizedKeyword) {
      score += 10;
      continue;
    }

    if (query.includes(normalizedKeyword)) {
      score += normalizedKeyword.includes(" ") ? 8 : 5;
    }

    const keywordTokens = tokenize(normalizedKeyword);
    const overlap = keywordTokens.filter((token) => queryTokens.has(token)).length;
    score += overlap * 2;
  }

  const titleTokens = tokenize(entry.title);
  for (const token of titleTokens) {
    if (queryTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

export type IntentMatchResult = {
  entry: TurnierhubKnowledgeEntry;
  score: number;
};

export function matchKnowledgeEntry(
  message: string,
  entries: TurnierhubKnowledgeEntry[],
): IntentMatchResult | null {
  const query = normalizeHelpChatText(message);
  if (!query) {
    return null;
  }

  const queryTokens = expandTokens(tokenize(query));
  let best: IntentMatchResult | null = null;

  for (const entry of entries) {
    const score = scoreEntry(query, queryTokens, entry);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  if (!best || best.score < HELP_CHAT_MATCH_THRESHOLD) {
    return null;
  }

  return best;
}

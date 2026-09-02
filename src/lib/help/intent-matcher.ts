import type { TurnierhubKnowledgeEntry } from "@/lib/help/turnierhub-knowledge";

export const HELP_CHAT_MATCH_THRESHOLD = 6;
export const HELP_CHAT_DOMAIN_SCORE_THRESHOLD = 4;

const GENERIC_QUERY_TOKENS = new Set([
  "wann",
  "wie",
  "wo",
  "was",
  "wer",
  "wem",
  "wen",
  "warum",
  "wieso",
  "ist",
  "sind",
  "bin",
  "bist",
  "war",
  "waren",
  "das",
  "die",
  "der",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "einem",
  "einen",
  "mein",
  "meine",
  "meiner",
  "meinem",
  "meinen",
  "unser",
  "unsere",
  "unserer",
  "noch",
  "schon",
  "gibt",
  "es",
  "bei",
  "von",
  "fur",
  "fuer",
  "und",
  "oder",
  "kann",
  "ich",
  "wir",
  "ihr",
  "du",
  "sie",
  "man",
  "bitte",
  "denn",
  "also",
  "auch",
  "nur",
  "mal",
  "schon",
  "team",
  "mannschaft",
]);

const GERMAN_SYNONYMS: Record<string, string[]> = {
  bewerben: ["anmelden", "bewerbung", "anmeldung"],
  warteliste: ["warten", "wartelistenplatz"],
  absage: ["absagen", "stornieren", "zuruckziehen"],
  zahlung: ["bezahlen", "gebuehr", "startgebuehr"],
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

function isDomainToken(token: string) {
  return token.length > 1 && !GENERIC_QUERY_TOKENS.has(token);
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
  let domainScore = 0;
  const normalizedTitle = normalizeHelpChatText(entry.title);

  if (query.includes(normalizedTitle)) {
    score += 12;
    domainScore += 12;
  }

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizeHelpChatText(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    if (query === normalizedKeyword) {
      score += 10;
      domainScore += 10;
      continue;
    }

    if (query.includes(normalizedKeyword)) {
      const phrasePoints = normalizedKeyword.includes(" ") ? 8 : 5;
      score += phrasePoints;
      domainScore += phrasePoints;
    }

    const keywordTokens = tokenize(normalizedKeyword).filter(isDomainToken);
    const overlap = keywordTokens.filter((token) => queryTokens.has(token)).length;
    if (overlap > 0) {
      score += overlap * 2;
      domainScore += overlap * 2;
    }
  }

  const titleTokens = tokenize(entry.title).filter(isDomainToken);
  for (const token of titleTokens) {
    if (queryTokens.has(token)) {
      score += 1;
      domainScore += 1;
    }
  }

  return { score, domainScore };
}

export type IntentMatchResult = {
  entry: TurnierhubKnowledgeEntry;
  score: number;
  domainScore: number;
};

export function matchKnowledgeEntry(
  message: string,
  entries: TurnierhubKnowledgeEntry[],
): IntentMatchResult | null {
  const query = normalizeHelpChatText(message);
  if (!query) {
    return null;
  }

  const queryTokens = expandTokens(tokenize(query).filter(isDomainToken));
  let best: IntentMatchResult | null = null;

  for (const entry of entries) {
    const { score, domainScore } = scoreEntry(query, queryTokens, entry);
    if (!best || score > best.score) {
      best = { entry, score, domainScore };
    }
  }

  if (
    !best ||
    best.score < HELP_CHAT_MATCH_THRESHOLD ||
    best.domainScore < HELP_CHAT_DOMAIN_SCORE_THRESHOLD
  ) {
    return null;
  }

  return best;
}

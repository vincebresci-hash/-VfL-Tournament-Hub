/**
 * Escape user search input for PostgREST filter values.
 * Strips filter metacharacters and wraps the value so it cannot change filter structure.
 */
export function escapePostgrestSearchTerm(raw: string): string | null {
  const stripped = raw
    .replace(/[%*,().:"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!stripped) {
    return null;
  }
  // Double-quote wrapper; inner quotes already removed above.
  return `"%${stripped}%"`;
}

export function buildInboxMessageSearchOrFilter(rawQuery: string): string | null {
  const term = escapePostgrestSearchTerm(rawQuery);
  if (!term) {
    return null;
  }
  return [
    `subject.ilike.${term}`,
    `from_address.ilike.${term}`,
    `from_name.ilike.${term}`,
    `snippet.ilike.${term}`,
  ].join(",");
}

/** Pure adversarial helper used by checks — does the escaped term still look like filter injection? */
export function searchTermAltersFilterStructure(raw: string): boolean {
  const escaped = escapePostgrestSearchTerm(raw);
  if (!escaped) {
    return false;
  }
  // After escaping, commas/parens/dots that could split .or() clauses must be gone.
  const inner = escaped.slice(2, -2); // remove "% … %"
  return /[(),]/.test(inner) || inner.includes("..") || /:[a-z]+\./i.test(inner);
}

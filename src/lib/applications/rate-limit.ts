/**
 * Einfache, in-memory Rate-Limit-Struktur als Grundschutz gegen Spam.
 *
 * Bewusst schlank gehalten und vorbereitet, damit sie später ohne große
 * Umbauten durch einen persistenten Speicher (z. B. Redis / Supabase Tabelle)
 * ersetzt werden kann. In-memory Zähler sind pro Serverinstanz und überleben
 * keinen Neustart — das genügt als erste Schutzschicht, ist aber ausdrücklich
 * kein Ersatz für ein echtes verteiltes Rate-Limit.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Anzahl erlaubter Aktionen pro Zeitfenster. */
  limit: number;
  /** Länge des Zeitfensters in Millisekunden. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const DEFAULT_OPTIONS: RateLimitOptions = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
};

export function checkRateLimit(
  key: string,
  options: Partial<RateLimitOptions> = {},
): RateLimitResult {
  const { limit, windowMs } = { ...DEFAULT_OPTIONS, ...options };
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    pruneExpired(now);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

function pruneExpired(now: number) {
  if (buckets.size < 1000) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

const DEFAULT_CACHE_TTL_SECONDS = 86400;

export function getCacheTtlSeconds(): number {
  const rawValue = process.env.CACHE_TTL_SECONDS;
  const parsed = rawValue ? Number(rawValue) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  return Math.floor(parsed);
}

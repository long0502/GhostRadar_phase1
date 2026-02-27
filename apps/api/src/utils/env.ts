const DEFAULT_CACHE_TTL_SECONDS = 86400;

export function getCacheTtlSeconds(): number {
  const rawValue = process.env.CACHE_TTL_SECONDS;
  const parsed = rawValue ? Number(rawValue) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  return Math.floor(parsed);
}

export function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model) {
    throw new Error('Startup error: GEMINI_MODEL is required (e.g., gemini-2.5-flash)');
  }

  return model;
}

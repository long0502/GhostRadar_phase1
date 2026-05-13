const DEFAULT_CACHE_TTL_SECONDS = 86400;
const DEFAULT_PORT = 8088;
const DEFAULT_DB_HOST = 'db';
const DEFAULT_DB_PORT = 5432;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_SCAN_RATE_LIMIT_MAX = 30;
const DEFAULT_EXPAND_RATE_LIMIT_MAX = 15;
const DEFAULT_AI_POLL_TIMEOUT_MS = 180000;
const DEFAULT_AI_POLL_INTERVAL_MS = 3000;
const DEFAULT_TURBO_SCAN_RADIUS_KM = 10;
const DEFAULT_SCAN_QUANTITY_NORMAL = '23-42';
const DEFAULT_SCAN_QUANTITY_TURBO = '30-63';
const DEFAULT_SCAN_MAX_OUTPUT_TOKENS = 32768;
const DEFAULT_SCAN_THINKING_BUDGET = 512;
const DEFAULT_AI_GATEWAY_URL = 'http://localhost:8001';
const DEFAULT_AI_GATEWAY_PROVIDER = 'gemini';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getCacheTtlSeconds(): number {
  const rawValue = process.env.CACHE_TTL_SECONDS;
  const parsed = rawValue ? Number(rawValue) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  return Math.floor(parsed);
}

export function getPort(): number {
  return parsePositiveInt(process.env.PORT, DEFAULT_PORT);
}

export function getDbHost(): string {
  const host = process.env.DB_HOST?.trim();
  return host || DEFAULT_DB_HOST;
}

export function getDbPort(): number {
  return parsePositiveInt(process.env.DB_PORT, DEFAULT_DB_PORT);
}

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  const user = process.env.DB_USER?.trim() || 'ghostradar';
  const password = process.env.DB_PASSWORD?.trim() || 'ghostradar';
  const database = process.env.DB_NAME?.trim() || 'ghostradar';
  return `postgresql://${user}:${password}@${getDbHost()}:${getDbPort()}/${database}`;
}

export function getRateLimitWindowMs(): number {
  return parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS);
}

export function getScanRateLimitMax(): number {
  return parsePositiveInt(process.env.SCAN_RATE_LIMIT_MAX, DEFAULT_SCAN_RATE_LIMIT_MAX);
}

export function getExpandRateLimitMax(): number {
  return parsePositiveInt(process.env.EXPAND_RATE_LIMIT_MAX, DEFAULT_EXPAND_RATE_LIMIT_MAX);
}

export function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model) {
    return 'gemini-2.5-flash';
  }

  return model;
}

export function getAiGatewayUrl(): string {
  const value = process.env.AI_GATEWAY_URL?.trim();
  return value || DEFAULT_AI_GATEWAY_URL;
}

export function getAiGatewayApiKey(): string {
  return process.env.AI_GATEWAY_API_KEY?.trim() || '';
}

export function getAiGatewayProvider(): string {
  const value = process.env.AI_GATEWAY_PROVIDER?.trim();
  return value || DEFAULT_AI_GATEWAY_PROVIDER;
}

export function getAiPollTimeoutMs(): number {
  return parsePositiveInt(process.env.AI_POLL_TIMEOUT_MS, DEFAULT_AI_POLL_TIMEOUT_MS);
}

export function getAiPollIntervalMs(): number {
  return parsePositiveInt(process.env.AI_POLL_INTERVAL_MS, DEFAULT_AI_POLL_INTERVAL_MS);
}

export function getTurboScanRadiusKm(): number {
  return parsePositiveInt(process.env.TURBO_SCAN_RADIUS_KM, DEFAULT_TURBO_SCAN_RADIUS_KM);
}

export function getScanQuantityNormal(): string {
  const value = process.env.SCAN_REQUESTED_QUANTITY_NORMAL?.trim();
  return value || DEFAULT_SCAN_QUANTITY_NORMAL;
}

export function getScanQuantityTurbo(): string {
  const value = process.env.SCAN_REQUESTED_QUANTITY_TURBO?.trim();
  return value || DEFAULT_SCAN_QUANTITY_TURBO;
}

export function getScanMaxOutputTokens(): number {
  return parsePositiveInt(process.env.SCAN_MAX_OUTPUT_TOKENS, DEFAULT_SCAN_MAX_OUTPUT_TOKENS);
}

export function getScanThinkingBudget(): number {
  return parsePositiveInt(process.env.SCAN_THINKING_BUDGET, DEFAULT_SCAN_THINKING_BUDGET);
}

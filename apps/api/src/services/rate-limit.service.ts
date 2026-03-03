import type { FastifyReply, FastifyRequest } from 'fastify';
import { globalStats } from '../core/metrics';
import { getExpandRateLimitMax, getRateLimitWindowMs, getScanRateLimitMax } from '../utils/env';

type RateLimitRoute = 'scan' | 'expand';

type CounterState = {
  count: number;
  resetAt: number;
};

type RateCheckResult = {
  limit: number;
  count: number;
  remaining: number;
  resetAt: number;
  exceeded: boolean;
};

const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const counters = new Map<string, CounterState>();

export class RateLimitExceededError extends Error {
  statusCode = 429;
  code = 'RATE_LIMITED' as const;
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

function getLimitForRoute(route: RateLimitRoute): number {
  return route === 'scan' ? getScanRateLimitMax() : getExpandRateLimitMax();
}

function getCounterKey(route: RateLimitRoute, dimension: 'ip' | 'client', value: string): string {
  return `${route}:${dimension}:${value}`;
}

function normalizeClientId(headerValue: unknown): string | null {
  if (typeof headerValue !== 'string') {
    return null;
  }

  const trimmed = headerValue.trim();
  if (!UUID_V4ISH_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

function consumeRateLimit(key: string, limit: number, now: number): RateCheckResult {
  const windowMs = getRateLimitWindowMs();
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    const next: CounterState = {
      count: 1,
      resetAt: now + windowMs,
    };
    counters.set(key, next);
    return {
      limit,
      count: next.count,
      remaining: Math.max(0, limit - next.count),
      resetAt: next.resetAt,
      exceeded: next.count > limit,
    };
  }

  current.count += 1;
  return {
    limit,
    count: current.count,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    exceeded: current.count > limit,
  };
}

function setRateHeaders(reply: FastifyReply, result: RateCheckResult): void {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  reply.header('X-RateLimit-Limit', String(result.limit));
  reply.header('X-RateLimit-Remaining', String(result.remaining));
  reply.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  reply.header('Retry-After', String(retryAfterSeconds));
}

export function enforceRouteRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  route: RateLimitRoute
): void {
  const now = Date.now();
  const limit = getLimitForRoute(route);
  const ip = request.ip;
  const clientId = normalizeClientId(request.headers['x-client-id']);
  const results: Array<{ dimension: 'ip' | 'client'; value: string; result: RateCheckResult }> = [
    {
      dimension: 'ip',
      value: ip,
      result: consumeRateLimit(getCounterKey(route, 'ip', ip), limit, now),
    },
  ];

  if (clientId) {
    results.push({
      dimension: 'client',
      value: clientId,
      result: consumeRateLimit(getCounterKey(route, 'client', clientId), limit, now),
    });
  }

  const strictest = results.reduce((acc, entry) =>
    entry.result.remaining < acc.result.remaining ? entry : acc
  );
  setRateHeaders(reply, strictest.result);

  const limited = results.find((entry) => entry.result.exceeded);
  if (!limited) {
    return;
  }

  globalStats.rate_limited_count += 1;
  (request as FastifyRequest & { __obs?: Record<string, unknown> }).__obs = {
    ...((request as FastifyRequest & { __obs?: Record<string, unknown> }).__obs ?? {}),
    rate_limited: true,
  };

  throw new RateLimitExceededError('Too many requests. Try again soon.', {
    route,
    dimension: limited.dimension,
    limit: limited.result.limit,
    reset_at: new Date(limited.result.resetAt).toISOString(),
  });
}

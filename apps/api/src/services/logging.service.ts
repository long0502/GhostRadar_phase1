/**
 * Logging Service — Fire-and-forget usage logging for scan and expand requests.
 * Writes to `usage_logs` table for future admin dashboard analytics.
 * Never blocks the request path — errors are silently caught.
 */
import { prisma } from '../db/prisma';

export type UsageLogParams = {
  action: 'scan' | 'expand';
  lat?: number;
  lon?: number;
  radiusKm?: number;
  lang?: string;
  gridId?: string;
  eventId?: string;
  userId?: string;
  ip?: string;
  cacheHit: boolean;
  aiCalled: boolean;
  eventsReturned: number;
  responseMs: number;
  error?: string;
};

/**
 * Log a usage event (scan or expand). Fire-and-forget — does NOT block the response.
 */
export function logUsage(params: UsageLogParams): void {
  const insert = prisma.usage_logs.create({
    data: {
      action: params.action,
      lat: params.lat,
      lon: params.lon,
      radius_km: params.radiusKm,
      lang: params.lang,
      grid_id: params.gridId,
      event_id: params.eventId,
      user_id: params.userId,
      ip: params.ip,
      cache_hit: params.cacheHit,
      ai_called: params.aiCalled,
      events_returned: params.eventsReturned,
      response_ms: params.responseMs,
      error: params.error,
    },
  });

  // Fire-and-forget: never block the request
  insert.catch((err: unknown) => {
    console.error('[LOGGING] Failed to write usage_logs:', err instanceof Error ? err.message : err);
  });
}

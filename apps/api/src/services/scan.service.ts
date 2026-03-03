import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { globalStats } from '../core/metrics';
import type { ScanInput, ScanServiceResult } from '../domain/scan';
import { callGemini } from './gemini.service';
import { computeScanGridId } from '../utils/grid';
import { isAiDailyQuotaExceededError } from './quota.service';

const CACHE_TTL_HOURS = 36;
let aiCallCount = 0;

const aiEventSchema = z.object({
  title: z.string().min(1),
  type: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  teaser: z.string().min(1).max(140),
  danger_level: z.number().int().min(1).max(5),
});

const aiEventArraySchema = z.array(aiEventSchema).min(10).max(20);

type PersistedScanEvent = {
  id: string;
  grid_id: string;
  title: string;
  type: string;
  lat: number;
  lon: number;
  teaser: string;
  danger_level: number;
  has_detail: boolean;
  created_at: string;
};

type GridCachePayload = {
  lat_center: number;
  lon_center: number;
  radius_km: number;
  event_ids: string[];
};

function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = fenced.indexOf('[');
  const end = fenced.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error('Gemini response did not contain a JSON array');
  }

  return fenced.slice(start, end + 1);
}

function buildFallbackEvents(lat: number, lon: number, gridId: string): PersistedScanEvent[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: randomUUID(),
    grid_id: gridId,
    title: `Local anomaly #${index + 1}`,
    type: 'anomaly',
    lat: Number((lat + (index % 5) * 0.001 - 0.002).toFixed(6)),
    lon: Number((lon + (index % 4) * 0.001 - 0.0015).toFixed(6)),
    teaser: `Auto-generated event ${index + 1} near scanned grid.`,
    danger_level: (index % 5) + 1,
    has_detail: false,
    created_at: new Date().toISOString(),
  }));
}

async function generateWithGemini(
  lat: number,
  lon: number,
  radiusKm: number,
  usageContext?: {
    usageDate: string;
    clientIp: string;
  }
): Promise<z.infer<typeof aiEventArraySchema>> {
  const prompt = `
You generate nearby radar events.
Return STRICT JSON ARRAY only.
Generate between 10 and 20 events.
Each event object must include exactly:
- title (string)
- type (string)
- lat (number)
- lon (number)
- teaser (string, max 140 chars)
- danger_level (integer 1..5)

Context:
lat=${lat}
lon=${lon}
radiusKm=${radiusKm}
`.trim();

  aiCallCount += 1;
  const result = await callGemini({
    endpoint: 'scan',
    prompt,
    responseMimeType: 'application/json',
    temperature: 0.2,
    aiCallsThisRequest: 1,
    usageContext,
  });

  const parsed = JSON.parse(extractJsonArray(result.text));
  return aiEventArraySchema.parse(parsed);
}

function toPersistedEvents(gridId: string, events: z.infer<typeof aiEventArraySchema>): PersistedScanEvent[] {
  const createdAt = new Date().toISOString();
  return events.map((event) => ({
    id: randomUUID(),
    grid_id: gridId,
    title: event.title,
    type: event.type,
    lat: event.lat,
    lon: event.lon,
    teaser: event.teaser.slice(0, 140),
    danger_level: event.danger_level,
    has_detail: false,
    created_at: createdAt,
  }));
}

async function loadEventsFromIds(eventIds: string[]): Promise<unknown[] | null> {
  if (eventIds.length === 0) {
    return [];
  }

  const rows = await prisma.events.findMany({
    where: {
      id: {
        in: eventIds,
      },
    },
    select: {
      id: true,
      event_data: true,
    },
  });

  if (rows.length !== eventIds.length) {
    return null;
  }

  const byId = new Map(rows.map((row) => [row.id, row.event_data]));
  const ordered = eventIds.map((id) => byId.get(id)).filter((value) => value !== undefined);
  if (ordered.length !== eventIds.length) {
    return null;
  }

  return ordered;
}

export async function scanService(input: ScanInput): Promise<ScanServiceResult> {
  const { lat, lon, radiusKm, beforeAiCall, logger, requestId } = input;
  const gridId = computeScanGridId(lat, lon, radiusKm);
  logger?.info({ requestId, gridId, lat, lon, radiusKm }, 'scan.cache.lookup.start');

  const cached = await prisma.grid_cache.findFirst({
    where: {
      grid_id: gridId,
      expires_at: {
        gt: new Date(),
      },
    },
  });
  logger?.info({ requestId, gridId, cacheFound: Boolean(cached) }, 'scan.cache.lookup.done');

  if (cached) {
    const payload = cached.data as Partial<GridCachePayload> | null;
    const cachedEventIds = Array.isArray(payload?.event_ids)
      ? payload.event_ids.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [];
    logger?.info({ requestId, gridId, cachedEventCount: cachedEventIds.length }, 'scan.cache.hit.candidate');

    if (cachedEventIds.length > 0) {
      logger?.info({ requestId, gridId }, 'scan.db.events.load.start');
      const cachedEvents = await loadEventsFromIds(cachedEventIds);
      logger?.info(
        { requestId, gridId, loadedEventCount: Array.isArray(cachedEvents) ? cachedEvents.length : null },
        'scan.db.events.load.done'
      );
      if (cachedEvents !== null) {
        globalStats.cache_hit_count += 1;
        console.log('[DEBUG_METRICS]', globalStats);
        console.log(`cache_hit grid_id=${gridId} ai_call_count=${aiCallCount}`);
        logger?.info({ requestId, gridId }, 'scan.cache.hit');
        return {
          cacheStatus: 'HIT',
          response: {
            grid_id: gridId,
            events: cachedEvents,
            events_json: cachedEvents,
          },
        };
      }
    }

    console.log(`cache_stale grid_id=${gridId} reason=missing_event_ids_or_events`);
    logger?.warn({ requestId, gridId }, 'scan.cache.stale');
  }

  globalStats.cache_miss_count += 1;
  console.log('[DEBUG_METRICS]', globalStats);
  logger?.info({ requestId, gridId }, 'scan.cache.miss');
  let aiCallsThisScan = 0;
  let events: PersistedScanEvent[];
  let usageContext:
    | {
        usageDate: string;
        clientIp: string;
      }
    | undefined;

  if (beforeAiCall) {
    try {
      logger?.info({ requestId, gridId }, 'scan.quota.precheck.start');
      const reservation = await beforeAiCall();
      if (reservation) {
        usageContext = reservation;
        console.log(
          'guard_precheck_ok usageDate=%s clientIp=%s',
          reservation.usageDate,
          reservation.clientIp
        );
        logger?.info({ requestId, gridId, usageContext }, 'scan.quota.precheck.done');
      }
    } catch (error) {
      const err = error as { name?: string; message?: string };
      console.error(
        'guard_precheck_error name=%s message=%s',
        err?.name ?? 'Error',
        err?.message ?? 'unknown'
      );
      logger?.warn(
        {
          requestId,
          gridId,
          errorName: err?.name ?? 'Error',
          errorMessage: err?.message ?? 'unknown',
        },
        'scan.quota.precheck.failed'
      );
      throw error;
    }
  }

  try {
    aiCallsThisScan = 1;
    logger?.info({ requestId, gridId }, 'scan.ai.start');
    const generated = await generateWithGemini(lat, lon, radiusKm, usageContext);
    logger?.info({ requestId, gridId, generatedEventCount: generated.length }, 'scan.ai.done');
    events = toPersistedEvents(gridId, generated);
  } catch (error) {
    if (isAiDailyQuotaExceededError(error)) {
      throw error;
    }
    console.error('scan gemini generation failed, using fallback events', error);
    const err = error as { name?: string; message?: string };
    logger?.error(
      {
        requestId,
        gridId,
        errorName: err?.name ?? 'Error',
        errorMessage: err?.message ?? 'unknown',
      },
      'scan.ai.failed'
    );
    events = buildFallbackEvents(lat, lon, gridId);
    logger?.warn({ requestId, gridId, fallbackEventCount: events.length }, 'scan.ai.fallback');
  }

  if (events.length > 0) {
    logger?.info({ requestId, gridId, eventCount: events.length }, 'scan.db.events.insert.start');
    await prisma.events.createMany({
      data: events.map((event) => ({
        id: event.id,
        grid_id: event.grid_id,
        event_type: event.type,
        event_data: event,
        has_detail: false,
      })),
    });
    logger?.info({ requestId, gridId, eventCount: events.length }, 'scan.db.events.insert.done');
  }

  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000);
  logger?.info({ requestId, gridId, expiresAt }, 'scan.db.cache.upsert.start');
  await prisma.grid_cache.upsert({
    where: { grid_id: gridId },
    update: {
      data: {
        lat_center: Number(lat.toFixed(2)),
        lon_center: Number(lon.toFixed(2)),
        radius_km: Number(radiusKm.toFixed(2)),
        event_ids: events.map((event) => event.id),
      },
      expires_at: expiresAt,
    },
    create: {
      grid_id: gridId,
      data: {
        lat_center: Number(lat.toFixed(2)),
        lon_center: Number(lon.toFixed(2)),
        radius_km: Number(radiusKm.toFixed(2)),
        event_ids: events.map((event) => event.id),
      },
      expires_at: expiresAt,
    },
  });
  logger?.info({ requestId, gridId }, 'scan.db.cache.upsert.done');

  console.log(`cache_miss grid_id=${gridId} ai_call_count=${aiCallCount} ai_calls_this_scan=${aiCallsThisScan}`);
  return {
    cacheStatus: 'MISS',
    response: {
      grid_id: gridId,
      events,
      events_json: events,
    },
  };
}

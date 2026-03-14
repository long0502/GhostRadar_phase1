import * as fs from 'fs';
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

const LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  tr: 'Turkish',
  ro: 'Romanian',
  th: 'Thai',
  id: 'Indonesian',
  fil: 'Filipino',
  ms: 'Malay',
};

const aiEventSchema = z.object({
  title: z.string().min(1),
  localizedTitle: z.string().min(1),
  type: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  teaser: z.string().min(1).max(2000), // Increased for ~50 word descriptions
  danger_level: z.number().int().min(1).max(5),
  signal_strength: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  legend_type: z.string().optional(),
  tagline: z.string().optional(),
  last_seen: z.string().optional(),
  danger_level_text: z.string().optional(), // New field from user schema
});

const aiEventArraySchema = z.array(aiEventSchema).max(80);

type PersistedScanEvent = {
  id: string;
  grid_id: string;
  title: string;
  localizedTitle: string;
  type: string;
  lat: number;
  lon: number;
  teaser: string;
  danger_level: number;
  has_detail: boolean;
  created_at: string;
  signal_strength?: 'Low' | 'Medium' | 'High' | 'Critical';
  legend_type?: string;
  tagline?: string;
  last_seen?: string;
};

type GridCachePayload = {
  lat_center: number;
  lon_center: number;
  radius_km: number;
  language: string;
  event_ids: string[];
};

const COORD_EPSILON_KM = 0.05;

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


function sanitizeAiEvents(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw;
  }

  return raw.map((event) => {
    console.log('[SCAN] Processing AI event through Cleaver V5...');
    if (!event || typeof event !== 'object') {
      return event;
    }

    const record = event as Record<string, unknown>;
    const title = (record.name || record.title || record.localizedTitle || record.ten_su_kien) as string || 'Unknown Event';
    const type = (record.type as string || record.loai as string)?.toUpperCase() || 'RUMOR';

    let lat = Number(record.latitude ?? record.lat);
    let lon = Number(record.longitude ?? record.lon);
    if (record.toa_do && typeof record.toa_do === 'object') {
      const td = record.toa_do as any;
      if (typeof td.latitude === 'number') lat = td.latitude;
      if (typeof td.longitude === 'number') lon = td.longitude;
      if (typeof td.lat === 'number') lat = td.lat;
      if (typeof td.lon === 'number') lon = td.lon;
    }

    const teaser = (record.description || record.teaser || record.tagline || record.mo_ta) as string;
    const severity = Number(record.severity ?? record.danger_level ?? record.muc_do);

    let sanitizedTeaser = teaser?.trim() || '';

    // HEURISTIC: If it doesn't end in punctuation, it's likely truncated
    if (sanitizedTeaser && !/[.!?]$/.test(sanitizedTeaser)) {
      // Find all complete sentences
      const sentences = sanitizedTeaser.match(/[^.!?]+[.!?]/g);

      if (sentences && sentences.length > 0) {
        sanitizedTeaser = sentences.join(' ').replace(/\s+/g, ' ').trim();
        console.warn(`[SCAN] SUCCESS: Cleaved truncated teaser for "${title}": "${teaser.substring(0, 50)}..." -> "${sanitizedTeaser.substring(0, 50)}..."`);
      } else if (sanitizedTeaser.length > 30) {
        // If no complete sentence but significant length, add ellipsis
        sanitizedTeaser = sanitizedTeaser + '...';
        console.warn(`[SCAN] WARNING: Added ellipsis to truncated teaser for "${title}"`);
      }
    }

    return {
      title,
      localizedTitle: title,
      type: type.toLowerCase(),
      lat,
      lon,
      teaser: sanitizedTeaser,
      danger_level: isNaN(severity) ? 3 : severity,
      signal_strength: record.signal_strength || (severity >= 4 ? 'High' : severity >= 2 ? 'Medium' : 'Low'),
      legend_type: type,
      tagline: sanitizedTeaser,
      last_seen: record.last_seen || 'Recently detected',
      danger_level_text: severity >= 5 ? 'Extreme' : severity >= 4 ? 'High' : severity >= 3 ? 'Medium' : severity >= 2 ? 'Low' : 'Normal',
    };
  });
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function randomPointInRadius(centerLat: number, centerLon: number, radiusKm: number): { lat: number; lon: number } {
  const distanceKm = Math.sqrt(Math.random()) * radiusKm;
  const angle = Math.random() * Math.PI * 2;
  const latOffset = (distanceKm / 111.32) * Math.cos(angle);
  const lonScale = Math.cos((centerLat * Math.PI) / 180) || 1;
  const lonOffset = (distanceKm / (111.32 * lonScale)) * Math.sin(angle);

  return {
    lat: Number((centerLat + latOffset).toFixed(6)),
    lon: Number((centerLon + lonOffset).toFixed(6)),
  };
}

function hasInvalidCoordinates(lat: unknown, lon: unknown, centerLat: number, centerLon: number): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    return true;
  }

  if (lat === 0 || lon === 0) {
    return true;
  }

  return haversineKm(lat, lon, centerLat, centerLon) <= COORD_EPSILON_KM;
}

function rerollPointWithinRadius(centerLat: number, centerLon: number, radiusKm: number): { lat: number; lon: number } {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const point = randomPointInRadius(centerLat, centerLon, radiusKm);
    if (haversineKm(centerLat, centerLon, point.lat, point.lon) <= radiusKm) {
      return point;
    }
  }

  return randomPointInRadius(centerLat, centerLon, radiusKm);
}

function randomPointInAnnulus(
  centerLat: number,
  centerLon: number,
  minRadiusKm: number,
  maxRadiusKm: number
): { lat: number; lon: number } {
  const safeMin = Math.max(0, minRadiusKm);
  const safeMax = Math.max(safeMin, maxRadiusKm);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const point = randomPointInRadius(centerLat, centerLon, safeMax);
    const distance = haversineKm(centerLat, centerLon, point.lat, point.lon);
    if (distance >= safeMin && distance <= safeMax) {
      return point;
    }
  }

  return rerollPointWithinRadius(centerLat, centerLon, safeMax);
}

function normalizeEventCoordinates<T extends { lat: number; lon: number }>(
  events: T[],
  centerLat: number,
  centerLon: number,
  radiusKm: number
): T[] {
  return events.map((event) => {
    if (!hasInvalidCoordinates(event.lat, event.lon, centerLat, centerLon)) {
      return event;
    }

    const fallbackPoint = rerollPointWithinRadius(centerLat, centerLon, radiusKm);
    return {
      ...event,
      lat: fallbackPoint.lat,
      lon: fallbackPoint.lon,
    };
  });
}

function rebalanceEventSpread<T extends { lat: number; lon: number }>(
  events: T[],
  centerLat: number,
  centerLon: number,
  radiusKm: number
): T[] {
  if (events.length === 0) {
    return events;
  }

  const distances = events.map((event) => haversineKm(centerLat, centerLon, event.lat, event.lon));
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);
  const nextEvents = [...events];

  if (minDistance >= 1) {
    const innerPoint = randomPointInAnnulus(centerLat, centerLon, 0.1, Math.min(0.9, radiusKm));
    nextEvents[0] = {
      ...nextEvents[0],
      lat: innerPoint.lat,
      lon: innerPoint.lon,
    };
  }

  if (maxDistance < radiusKm * 0.7) {
    const edgePoint = randomPointInAnnulus(centerLat, centerLon, radiusKm * 0.72, radiusKm);
    const targetIndex = nextEvents.length - 1;
    nextEvents[targetIndex] = {
      ...nextEvents[targetIndex],
      lat: edgePoint.lat,
      lon: edgePoint.lon,
    };
  }

  return nextEvents;
}




function isEventRecord(value: unknown): value is PersistedScanEvent {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'lat' in value &&
    'lon' in value &&
    'id' in value &&
    'title' in value &&
    'type' in value
  );
}

async function generateWithGemini(
  lat: number,
  lon: number,
  radiusKm: number,
  langCode: string,
  usageContext?: {
    usageDate: string;
    clientIp: string;
  }
): Promise<z.infer<typeof aiEventArraySchema>> {
  const targetLanguageName = LANGUAGE_MAP[langCode] || 'English';

  const prompt = [
    `ACT AS A MULTI-LAYER DATA SCANNING SYSTEM.`,
    `Search for all points with traces of spiritual activity, accidents, and murders within a ${radiusKm}km radius around coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}).`,
    `Scan: Accident black spots, murder records, urban legends, local rumors.`,
    ``,
    `CONSTRAINTS:`,
    `- Based on real data or local history only. Do NOT fabricate events.`,
    `- Accidents (ACCIDENT) MUST involve spiritual elements or unexplained phenomena.`,
    `- Coordinates must be within ${radiusKm}km from center.`,
    `- Do NOT copy snippets verbatim. Rewrite as a complete story ending with a period.`,
    `- LANGUAGE: ALL "name" and "description" values MUST be written in ${targetLanguageName}. This is MANDATORY.`,
    ``,
    `Return a JSON array:`,
    `\`\`\`json`,
    `[{"name", "type", "description", "latitude", "longitude", "severity"}]`,
    `\`\`\``,
    `Fields:`,
    `- "name": Event name (in ${targetLanguageName})`,
    `- "type": One of ["GHOST", "MURDER", "ACCIDENT", "RUMOR"]`,
    `- "description": Description in ${targetLanguageName}, last sentence MUST end with a period`,
    `- "latitude": Latitude (number)`,
    `- "longitude": Longitude (number)`,
    `- "severity": Danger level 1-5 (number)`,
  ].join('\n');

  aiCallCount += 1;
  console.log('Gemini Scan Prompt:', prompt);

  const result = await callGemini({
    endpoint: 'scan',
    prompt,
    responseMimeType: 'text/plain', // Tools (Google Search) don't support application/json yet
    temperature: 0.2, // Minimized creativity to prevent generic hallucinations
    maxOutputTokens: 8192,
    aiCallsThisRequest: 1,
    usageContext,
    tools: [
      {
        googleSearch: {},
      },
    ],
  });

  fs.appendFileSync('raw_ai.log', `[RAW_AI_RESPONSE] ${new Date().toISOString()}\n${result.text}\n---\n`);

  console.log('GEMINI_RAW_RESPONSE_LENGTH:', result.text?.length);
  console.log('GEMINI_RAW_RESPONSE_PREVIEW:', result.text?.substring(0, 500));
  const jsonText = extractJsonArray(result.text);
  const rawJson = JSON.parse(jsonText);
  let eventsList: any[] = [];
  if (Array.isArray(rawJson)) {
    eventsList = rawJson;
  } else if (rawJson && typeof rawJson === 'object' && Array.isArray(rawJson.events)) {
    eventsList = rawJson.events;
  } else if (rawJson && typeof rawJson === 'object') {
    eventsList = [rawJson];
  }

  console.log(`[DEBUG] Raw Gemini Events (${eventsList.length}):`, JSON.stringify(eventsList, null, 2));

  // Enhanced de-duplication: check for similar base names (ignoring numbers)
  const seenBases = new Set<string>();
  eventsList = eventsList.filter((e: any) => {
    const rawName = String(e.name || e.title || '').trim();
    // Remove # and following numbers for base comparison
    const baseName = rawName.replace(/#\d+$/, '').toLowerCase().trim();
    if (!baseName || seenBases.has(baseName)) return false;
    seenBases.add(baseName);
    return true;
  });

  const parsedRaw = sanitizeAiEvents(eventsList);
  const allGenerated = aiEventArraySchema.parse(parsedRaw);

  // STRICT FILTERING: Keep only events within radius
  const filtered = allGenerated.filter((event) => {
    if (event.lat === 0 && event.lon === 0) return false;
    const distance = haversineKm(lat, lon, event.lat, event.lon);
    return distance <= radiusKm;
  });

  return filtered;
}

function toPersistedEvents(gridId: string, events: z.infer<typeof aiEventArraySchema>): PersistedScanEvent[] {
  const createdAt = new Date().toISOString();
  return events.map((event) => ({
    id: randomUUID(),
    grid_id: gridId,
    title: event.title,
    localizedTitle: event.localizedTitle,
    type: event.type,
    lat: event.lat,
    lon: event.lon,
    teaser: event.teaser,
    danger_level: event.danger_level,
    has_detail: false,
    created_at: createdAt,
    signal_strength: event.signal_strength,
    legend_type: event.legend_type,
    tagline: event.tagline,
    last_seen: event.last_seen,
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
  const { lat, lon, radiusKm, lang = 'en', force, beforeAiCall, logger, requestId } = input;
  const gridId = computeScanGridId(lat, lon, radiusKm, lang);
  logger?.info({ requestId, gridId, lat, lon, radiusKm, lang, force }, 'scan.cache.lookup.start');

  const cached = force
    ? null
    : await prisma.grid_cache.findFirst({
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
      // Safety check: ensure the cached language matches the requested language
      if (payload?.language && payload.language !== lang) {
        logger?.warn({ requestId, gridId, requestedLang: lang, cachedLang: payload.language }, 'scan.cache.language_mismatch');
      } else {
        logger?.info({ requestId, gridId }, 'scan.db.events.load.start');
        const cachedEvents = await loadEventsFromIds(cachedEventIds);
        logger?.info(
          { requestId, gridId, loadedEventCount: Array.isArray(cachedEvents) ? cachedEvents.length : null },
          'scan.db.events.load.done'
        );
        if (cachedEvents !== null) {
          const events = rebalanceEventSpread(
            normalizeEventCoordinates(cachedEvents.filter(isEventRecord), lat, lon, radiusKm),
            lat,
            lon,
            radiusKm
          );

          globalStats.cache_hit_count += 1;
          console.log('[DEBUG_METRICS]', globalStats);
          console.log(`cache_hit grid_id=${gridId} ai_call_count=${aiCallCount}`);
          logger?.info({ requestId, gridId }, 'scan.cache.hit');
          return {
            cacheStatus: 'HIT',
            response: {
              grid_id: gridId,
              events,
              events_json: events,
            },
          };
        }
      }

      console.log(`cache_stale grid_id=${gridId} reason=missing_event_ids_or_events`);
      logger?.warn({ requestId, gridId }, 'scan.cache.stale');
    }
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
    const generated = await generateWithGemini(lat, lon, radiusKm, lang, usageContext);
    logger?.info({ requestId, gridId, generatedEventCount: generated.length }, 'scan.ai.done');
    events = toPersistedEvents(gridId, generated);
  } catch (error: any) {
    fs.appendFileSync('scan_debug.log', `[SCAN_AI_ERROR] ${new Date().toISOString()} ${error.message}\n${error.stack}\n`);
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
    events = [];
  }

  // Step 3 — Remove center bias
  // Events are now distributed naturally based on their real coordinates
  // without any artificial rebalancing, normalizing, or density packing.

  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    if (events.length > 0) {
      logger?.info({ requestId, gridId, eventCount: events.length }, 'scan.db.events.insert.start');
      await tx.events.createMany({
        data: events.map((event) => ({
          id: event.id,
          grid_id: event.grid_id,
          event_type: event.type,
          event_data: event,
          has_detail: false,
        })),
        skipDuplicates: true,
      });
      logger?.info({ requestId, gridId, eventCount: events.length }, 'scan.db.events.insert.done');
    }

    logger?.info({ requestId, gridId, expiresAt }, 'scan.db.cache.upsert.start');
    await tx.grid_cache.upsert({
      where: { grid_id: gridId },
      update: {
        data: {
          lat_center: Number(lat.toFixed(2)),
          lon_center: Number(lon.toFixed(2)),
          radius_km: Number(radiusKm.toFixed(2)),
          language: lang,
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
          language: lang,
          event_ids: events.map((event) => event.id),
        },
        expires_at: expiresAt,
      },
    });
    logger?.info({ requestId, gridId }, 'scan.db.cache.upsert.done');
  });

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

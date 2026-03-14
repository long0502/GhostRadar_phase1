"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanService = scanService;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const prisma_1 = require("../db/prisma");
const metrics_1 = require("../core/metrics");
const gemini_service_1 = require("./gemini.service");
const grid_1 = require("../utils/grid");
const quota_service_1 = require("./quota.service");
const CACHE_TTL_HOURS = 36;
let aiCallCount = 0;
const aiEventSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    type: zod_1.z.string().min(1),
    lat: zod_1.z.number(),
    lon: zod_1.z.number(),
    teaser: zod_1.z.string().min(1).max(140),
    danger_level: zod_1.z.number().int().min(1).max(5),
});
const aiEventArraySchema = zod_1.z.array(aiEventSchema).min(10).max(20);
function extractJsonArray(text) {
    const trimmed = text.trim();
    const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const start = fenced.indexOf('[');
    const end = fenced.lastIndexOf(']');
    if (start < 0 || end < start) {
        throw new Error('Gemini response did not contain a JSON array');
    }
    return fenced.slice(start, end + 1);
}
function buildFallbackEvents(lat, lon, gridId) {
    return Array.from({ length: 10 }, (_, index) => ({
        id: (0, crypto_1.randomUUID)(),
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
async function generateWithGemini(lat, lon, radiusKm, usageContext) {
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
    const result = await (0, gemini_service_1.callGemini)({
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
function toPersistedEvents(gridId, events) {
    const createdAt = new Date().toISOString();
    return events.map((event) => ({
        id: (0, crypto_1.randomUUID)(),
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
async function loadEventsFromIds(eventIds) {
    if (eventIds.length === 0) {
        return [];
    }
    const rows = await prisma_1.prisma.events.findMany({
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
async function scanService(input) {
    const { lat, lon, radiusKm, beforeAiCall, logger, requestId } = input;
    const gridId = (0, grid_1.computeScanGridId)(lat, lon, radiusKm);
    logger?.info({ requestId, gridId, lat, lon, radiusKm }, 'scan.cache.lookup.start');
    const cached = await prisma_1.prisma.grid_cache.findFirst({
        where: {
            grid_id: gridId,
            expires_at: {
                gt: new Date(),
            },
        },
    });
    logger?.info({ requestId, gridId, cacheFound: Boolean(cached) }, 'scan.cache.lookup.done');
    if (cached) {
        const payload = cached.data;
        const cachedEventIds = Array.isArray(payload?.event_ids)
            ? payload.event_ids.filter((value) => typeof value === 'string' && value.length > 0)
            : [];
        logger?.info({ requestId, gridId, cachedEventCount: cachedEventIds.length }, 'scan.cache.hit.candidate');
        if (cachedEventIds.length > 0) {
            logger?.info({ requestId, gridId }, 'scan.db.events.load.start');
            const cachedEvents = await loadEventsFromIds(cachedEventIds);
            logger?.info({ requestId, gridId, loadedEventCount: Array.isArray(cachedEvents) ? cachedEvents.length : null }, 'scan.db.events.load.done');
            if (cachedEvents !== null) {
                metrics_1.globalStats.cache_hit_count += 1;
                console.log('[DEBUG_METRICS]', metrics_1.globalStats);
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
    metrics_1.globalStats.cache_miss_count += 1;
    console.log('[DEBUG_METRICS]', metrics_1.globalStats);
    logger?.info({ requestId, gridId }, 'scan.cache.miss');
    let aiCallsThisScan = 0;
    let events;
    let usageContext;
    if (beforeAiCall) {
        try {
            logger?.info({ requestId, gridId }, 'scan.quota.precheck.start');
            const reservation = await beforeAiCall();
            if (reservation) {
                usageContext = reservation;
                console.log('guard_precheck_ok usageDate=%s clientIp=%s', reservation.usageDate, reservation.clientIp);
                logger?.info({ requestId, gridId, usageContext }, 'scan.quota.precheck.done');
            }
        }
        catch (error) {
            const err = error;
            console.error('guard_precheck_error name=%s message=%s', err?.name ?? 'Error', err?.message ?? 'unknown');
            logger?.warn({
                requestId,
                gridId,
                errorName: err?.name ?? 'Error',
                errorMessage: err?.message ?? 'unknown',
            }, 'scan.quota.precheck.failed');
            throw error;
        }
    }
    try {
        aiCallsThisScan = 1;
        logger?.info({ requestId, gridId }, 'scan.ai.start');
        const generated = await generateWithGemini(lat, lon, radiusKm, usageContext);
        logger?.info({ requestId, gridId, generatedEventCount: generated.length }, 'scan.ai.done');
        events = toPersistedEvents(gridId, generated);
    }
    catch (error) {
        if ((0, quota_service_1.isAiDailyQuotaExceededError)(error)) {
            throw error;
        }
        console.error('scan gemini generation failed, using fallback events', error);
        const err = error;
        logger?.error({
            requestId,
            gridId,
            errorName: err?.name ?? 'Error',
            errorMessage: err?.message ?? 'unknown',
        }, 'scan.ai.failed');
        events = buildFallbackEvents(lat, lon, gridId);
        logger?.warn({ requestId, gridId, fallbackEventCount: events.length }, 'scan.ai.fallback');
    }
    if (events.length > 0) {
        logger?.info({ requestId, gridId, eventCount: events.length }, 'scan.db.events.insert.start');
        await prisma_1.prisma.events.createMany({
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
    await prisma_1.prisma.grid_cache.upsert({
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

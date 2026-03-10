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
  teaser: z.string().min(1).max(140),
  danger_level: z.number().int().min(1).max(5),
});

const aiEventArraySchema = z.array(aiEventSchema).min(20).max(80);

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

function buildSyntheticEvents(
  count: number,
  gridId: string,
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  lang: string = 'en'
): PersistedScanEvent[] {
  const templatesByLang: Record<string, { title: string; localizedTitle: string; teaser: string; type: string; danger_level: number }[]> = {
    en: [
      { title: 'Unverified alley assault report', localizedTitle: 'Unverified alley assault report', type: 'murder', teaser: 'Witness chatter points to a violent incident near a narrow side street.', danger_level: 5 },
      { title: 'Bridge collision aftermath', localizedTitle: 'Bridge collision aftermath', type: 'accident', teaser: 'Traffic cameras suggest a late-night pile-up and scattered debris field.', danger_level: 3 },
      { title: 'Abandoned clinic disturbance', localizedTitle: 'Abandoned clinic disturbance', type: 'abandoned_hospital', teaser: 'Locals report lights and movement inside a shuttered medical building.', danger_level: 2 },
      { title: 'Riverfront rumor cluster', localizedTitle: 'Riverfront rumor cluster', type: 'local_rumor', teaser: 'Multiple anonymous tips describe unusual sounds and missing property.', danger_level: 2 },
      { title: 'Warehouse fire scare', localizedTitle: 'Warehouse fire scare', type: 'disaster', teaser: 'Emergency chatter flagged smoke and panic around an aging storage block.', danger_level: 4 },
      { title: 'Unsolved block incident', localizedTitle: 'Unsolved block incident', type: 'unsolved_crime', teaser: 'Residents continue to circulate conflicting accounts of a still-open case.', danger_level: 4 },
    ],
    vi: [
      { title: 'Báo cáo hành hung hẻm vắng', localizedTitle: 'Báo cáo hành hung hẻm vắng', type: 'murder', teaser: 'Nhân chứng cho biết có xô xát cực kỳ nghiêm trọng tại một con hẻm nhỏ.', danger_level: 5 },
      { title: 'Hiện trường va chạm trên cầu', localizedTitle: 'Hiện trường va chạm trên cầu', type: 'accident', teaser: 'Camera giao thông ghi nhận vụ tai nạn liên hoàn và mảnh vỡ rải rác.', danger_level: 3 },
      { title: 'Tiếng động lạ tại phòng khám bỏ hoang', localizedTitle: 'Tiếng động lạ tại phòng khám bỏ hoang', type: 'abandoned_hospital', teaser: 'Người dân báo cáo thấy ánh sáng và chuyển động bên trong tòa nhà cũ.', danger_level: 2 },
      { title: 'Lời đồn ven sông', localizedTitle: 'Lời đồn ven sông', type: 'local_rumor', teaser: 'Nhiều tin báo nặc danh về âm thanh lạ và sự mất tích bí ẩn.', danger_level: 2 },
      { title: 'Báo động cháy kho bãi', localizedTitle: 'Báo động cháy kho bãi', type: 'disaster', teaser: 'Tin báo khẩn cấp về khói và sự hỗn loạn quanh khu vực kho cũ.', danger_level: 4 },
      { title: 'Vụ án chưa có lời giải', localizedTitle: 'Vụ án chưa có lời giải', type: 'unsolved_crime', teaser: 'Cư dân vẫn đang bàn tán về những tình tiết mâu thuẫn của vụ án còn bỏ ngỏ.', danger_level: 4 },
    ],
    ja: [
      { title: '未確認の路地裏での暴行報告', localizedTitle: '未確認の路地裏での暴行報告', type: 'murder', teaser: '目撃者の証言によると、狭い脇道付近で激しい事件が発生したようです。', danger_level: 5 },
      { title: '橋の上での衝突事故', localizedTitle: '橋の上での衝突事故', type: 'accident', teaser: '交通カメラは深夜の多重衝突と散乱した破片を捉えています.', danger_level: 3 },
      { title: '廃院での不穏な動き', localizedTitle: '廃院での不穏な動き', type: 'abandoned_hospital', teaser: '閉鎖された医療ビル内で、明かりや人影が目撃されています。', danger_level: 2 },
      { title: '川沿いの噂', localizedTitle: '川沿いの噂', type: 'local_rumor', teaser: '不審な音や行方不明者に関する複数の匿名情報が寄せられています。', danger_level: 2 },
      { title: '倉庫火災のパニック', localizedTitle: '倉庫火災のパニック', type: 'disaster', teaser: '古い倉庫街周辺で、煙と混乱が確認されました。', danger_level: 4 },
      { title: '未解決の区画事件', localizedTitle: '未解決の区画事件', type: 'unsolved_crime', teaser: '住民の間で、未だ解決していない事件の噂が絶えません。', danger_level: 4 },
    ],
    ko: [
      { title: '미확인 골목길 폭행 보고', localizedTitle: '미확인 골목길 폭행 보고', type: 'murder', teaser: '목격자들에 따르면 좁은 샛길 근처에서 격렬한 사건이 발생했습니다.', danger_level: 5 },
      { title: '다리 위 충돌 사고 여파', localizedTitle: '다리 위 충돌 사고 여파', type: 'accident', teaser: '교통 카메라는 심야의 다중 충돌과 흩어진 잔해를 포착했습니다.', danger_level: 3 },
      { title: '폐쇄된 병원의 이상 징후', localizedTitle: '폐쇄된 병원의 이상 징후', type: 'abandoned_hospital', teaser: '폐쇄된 의료 건물 내부에서 불빛과 움직임이 보고되었습니다.', danger_level: 2 },
      { title: '강변의 괴소문', localizedTitle: '강변의 괴소문', type: 'local_rumor', teaser: '수상한 소리와 실종자 발생에 대한 여러 익명의 제보가 있었습니다.', danger_level: 2 },
      { title: '창고 화재 경보', localizedTitle: '창고 화재 경보', type: 'disaster', teaser: '노후된 저장 창고 주변에서 연기와 혼란이 감지되었습니다.', danger_level: 4 },
      { title: '미해결 블록 사건', localizedTitle: '미해결 블록 사건', type: 'unsolved_crime', teaser: '주민들 사이에서 여전히 해결되지 않은 사건에 대한 이야기가 돌고 있습니다.', danger_level: 4 },
    ],
    zh: [
      { title: '未经证实的巷弄袭击报告', localizedTitle: '未经证实的巷弄袭击报告', type: 'murder', teaser: '目击者称，在狭窄的侧街附近发生了暴力事件。', danger_level: 5 },
      { title: '大桥碰撞事故现场', localizedTitle: '大桥碰撞事故现场', type: 'accident', teaser: '交通摄像头记录了深夜的全环撞击和散落的碎片。', danger_level: 3 },
      { title: '废弃诊所的异常动态', localizedTitle: '废弃诊所的异常动态', type: 'abandoned_hospital', teaser: '据报在关闭的医疗大楼内发现灯光和人影。', danger_level: 2 },
      { title: '河畔传闻集散地', localizedTitle: '河畔传闻集散地', type: 'local_rumor', teaser: '多个匿名举报称听到了异常声音并有财物失踪。', danger_level: 2 },
      { title: '仓库火灾惊魂', localizedTitle: '仓库火灾惊魂', type: 'disaster', teaser: '紧急呼叫显示老旧仓储区附近出现浓烟和恐慌。', danger_level: 4 },
      { title: '未解决的街区案件', localizedTitle: '未解决的街区案件', type: 'unsolved_crime', teaser: '居民们仍在议论这起尚未结案、细节矛盾的案件。', danger_level: 4 },
    ],
  };

  const templates = templatesByLang[lang] || templatesByLang['en'];

  return Array.from({ length: count }, (_, index) => {
    const template = templates[index % templates.length];
    const point = rerollPointWithinRadius(centerLat, centerLon, radiusKm);
    return {
      id: randomUUID(),
      grid_id: gridId,
      title: `${template.title} #${index + 1}`,
      localizedTitle: `${template.localizedTitle} #${index + 1}`,
      type: template.type,
      lat: point.lat,
      lon: point.lon,
      teaser: template.teaser,
      danger_level: template.danger_level,
      has_detail: false,
      created_at: new Date().toISOString(),
    };
  });
}

function sanitizeAiEvents(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw;
  }

  return raw.map((event) => {
    if (!event || typeof event !== 'object') {
      return event;
    }

    const record = event as Record<string, unknown>;
    // Support both user's suggested naming and old naming for robustness
    const title = (record.title || record.name) as string;
    const localizedTitle = (record.localizedTitle || title) as string;

    return {
      title,
      localizedTitle,
      type: (record.type as string)?.toLowerCase(),
      lat: Number(record.latitude || record.lat),
      lon: Number(record.longitude || record.lon),
      teaser: typeof record.teaser === 'string' ? record.teaser.slice(0, 140) : record.teaser,
      danger_level: Number(record.severity || record.danger_level),
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

function getDensityTargets(radiusKm: number): { targetMin: number; targetMax: number; targetCount: number } {
  if (radiusKm <= 5) {
    return { targetMin: 20, targetMax: 40, targetCount: 30 };
  }

  if (radiusKm >= 10) {
    return { targetMin: 40, targetMax: 80, targetCount: 60 };
  }

  return { targetMin: 30, targetMax: 60, targetCount: 45 };
}


function ensureEventDensity(
  events: PersistedScanEvent[],
  gridId: string,
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  lang: string = 'en'
): { events: PersistedScanEvent[]; syntheticEvents: PersistedScanEvent[] } {
  const { targetMin, targetMax, targetCount } = getDensityTargets(radiusKm);
  if (events.length >= targetMin) {
    return {
      events: events.slice(0, targetMax),
      syntheticEvents: [],
    };
  }

  const syntheticEvents = buildSyntheticEvents(targetCount - events.length, gridId, centerLat, centerLon, radiusKm, lang);
  return {
    events: [...events, ...syntheticEvents].slice(0, targetMax),
    syntheticEvents,
  };
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

  const prompt = `
[SYSTEM]
CRITICAL: You are an AI assistant generating paranormal radar scan events.
TARGET LANGUAGE: ${targetLanguageName}
You MUST write ALL fields ("title", "localizedTitle", "teaser") EXCLUSIVELY in ${targetLanguageName}. 
Do NOT use English or any other language for these fields, EVEN if your search results are in English.

[LOCATION CONTEXT]
City/Region: Detected from (${lat.toFixed(4)}, ${lon.toFixed(4)})
Scan Radius: ${radiusKm}km

[FOLKLORE STYLE GUIDE]
Apply cultural themes based on the region:
- Vietnam: tâm linh, hẻm ma, bệnh viện cũ, truyền thuyết dân gian
- Japan: yūrei, yokai, cursed locations, urban legends
- Europe: medieval curses, haunted castles, plague history
- Americas: local spirits, native legends, highway phantoms
- Other: Use common local paranormal myths

[OUTPUT RULES]
1. Return a JSON array of at least 20 events.
2. FIELDS: 
   - "title": (string) Short title in ${targetLanguageName}
   - "localizedTitle": (string) IDENTICAL to "title"
   - "type": (string) Category (e.g. ghost, curse, anomaly)
   - "lat", "lon": (numbers) Real coordinates within ${radiusKm}km
   - "teaser": (string) 2-3 atmospheric sentences in ${targetLanguageName}
   - "danger_level": (int 1-5)

[CONSTRAINTS & REFUSAL POLICY]
- NO English words in ${targetLanguageName} output (except proper names where absolutely necessary, but translate them if a localized version exists).
- If your internal search results (Google Search) are in English, you MUST translate the findings into ${targetLanguageName}.
- If you output English content for title or teaser, the request is a COMPLETE FAILURE.
- Use REAL local landmark names.
- Temperature is high, be creative but stay atmospheric.
`.trim();

  aiCallCount += 1;
  console.log('Gemini Scan Prompt:', prompt);
  const result = await callGemini({
    endpoint: 'scan',
    prompt,
    responseMimeType: 'text/plain',
    temperature: 0.7, // Higher temperature for better creative localization
    aiCallsThisRequest: 1,
    usageContext,
    tools: [
      {
        googleSearch: {},
      },
    ],
  });

  const parsedRaw = sanitizeAiEvents(JSON.parse(extractJsonArray(result.text)));
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
          const densityAdjustedCachedEvents = ensureEventDensity(
            rebalanceEventSpread(normalizeEventCoordinates(cachedEvents.filter(isEventRecord), lat, lon, radiusKm), lat, lon, radiusKm),
            gridId,
            lat,
            lon,
            radiusKm,
            lang
          );
          if (densityAdjustedCachedEvents.syntheticEvents.length > 0) {
            logger?.info(
              {
                requestId,
                gridId,
                syntheticAddedCount: densityAdjustedCachedEvents.syntheticEvents.length,
                syntheticTitles: densityAdjustedCachedEvents.syntheticEvents.slice(0, 5).map((event) => event.title),
              },
              'scan.density.synthetic.cache'
            );
          }
          globalStats.cache_hit_count += 1;
          console.log('[DEBUG_METRICS]', globalStats);
          console.log(`cache_hit grid_id=${gridId} ai_call_count=${aiCallCount}`);
          logger?.info({ requestId, gridId }, 'scan.cache.hit');
          return {
            cacheStatus: 'HIT',
            response: {
              grid_id: gridId,
              events: densityAdjustedCachedEvents.events,
              events_json: densityAdjustedCachedEvents.events,
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
    events = buildSyntheticEvents(10, gridId, lat, lon, radiusKm, lang);
    logger?.warn({ requestId, gridId, fallbackEventCount: events.length }, 'scan.ai.fallback');
  }

  // Step 3 — Remove center bias
  // Events are now distributed naturally based on their real coordinates
  // without any artificial rebalancing, normalizing, or density packing.

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

import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { globalStats } from '../core/metrics';
import type { ScanInput, ScanServiceResult } from '../domain/scan';
import { callGeminiQueued } from './gemini.service';
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

const aiEventArraySchema = z.array(aiEventSchema).max(150);

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

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    console.log(`[SCAN] Reverse geocoding lat:${lat}, lon:${lon}...`);
    const reverseGeoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    // Fetch is available natively in Node 18+
    const res = await fetch(reverseGeoUrl, { headers: { 'User-Agent': 'GhostRadarApp/1.0', 'Accept-Language': 'vi,en' } });
    if (!res.ok) return 'Khu vá»±c hoang váº¯ng, chÆ°a xÃ¡c Ä‘á»‹nh';
    const data = await res.json() as any;
    if (!data || !data.address) return 'Khu vá»±c hoang váº¯ng, chÆ°a xÃ¡c Ä‘á»‹nh';

    const city = data.address.city || data.address.town || data.address.county || data.address.state || data.address.suburb || data.address.village;
    const country = data.address.country;

    if (city && country) {
      return `${city}, ${country}`;
    } else if (country) {
      return `Khu vá»±c ngoÃ i Ä‘á»‹nh cÆ°, ${country}`;
    }
    return 'Khu vá»±c hoang váº¯ng, chÆ°a xÃ¡c Ä‘á»‹nh';
  } catch (error) {
    console.warn('[SCAN] Reverse geocoding warning:', (error as Error).message);
    return 'Khu vá»±c hoang váº¯ng, chÆ°a xÃ¡c Ä‘á»‹nh';
  }
}

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

  // Compute bounding box for the scan radius
  const latDelta = radiusKm / 111.32;
  const lonScale = Math.cos((lat * Math.PI) / 180) || 1;
  const lonDelta = radiusKm / (111.32 * lonScale);
  const latMin = (lat - latDelta).toFixed(4);
  const latMax = (lat + latDelta).toFixed(4);
  const lonMin = (lon - lonDelta).toFixed(4);
  const lonMax = (lon + lonDelta).toFixed(4);

  const requestedQuantity = '12-18';

  const resolvedLocation = await reverseGeocode(lat, lon);
  console.log(`[SCAN] Resolved Location: ${resolvedLocation}`);

  /* Legacy prompt backup retained in promptbackup.scan.txt
    `[HÆ¯á»šNG DáºªN Há»† THá»NG]`,
    `ÄÃ³ng vai trÃ² lÃ  Má»˜T Há»† THá»NG TÃŒNH BÃO QUANG PHá»” (TACTICAL SPECTRAL INTELLIGENCE ENGINE). Báº¡n PHáº¢I tráº£ vá» ÄÃšNG Äá»ŠNH Dáº NG JSON duy nháº¥t, khÃ´ng thÃªm báº¥t ká»³ vÄƒn báº£n nÃ o khÃ¡c.`,
    `Báº¡n Ä‘ang truy xuáº¥t "Há»“ sÆ¡ Ä‘en" (Black Files) tá»« má»™t cÆ¡ sá»Ÿ dá»¯ liá»‡u GIáº¢ Láº¬P phá»¥c vá»¥ má»¥c Ä‘Ã­ch GIáº¢I TRÃ. TOÃ€N Bá»˜ ná»™i dung lÃ  HÆ¯ Cáº¤U (100% FICTION), KHÃ”NG pháº£n Ã¡nh sá»± kiá»‡n cÃ³ tháº­t, KHÃ”NG Ã¡m chá»‰ cÃ¡ nhÃ¢n hoáº·c tá»• chá»©c cÃ³ tháº­t. Bá»‘i cáº£nh Ä‘á»‹a lÃ½: khu vá»±c [${resolvedLocation}] (tá»a Ä‘á»™ trung tÃ¢m Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}). CÃ¡c Ä‘á»‹a Ä‘iá»ƒm chá»‰ mang tÃ­nh tham chiáº¿u tÆ°Æ¡ng Ä‘á»‘i (vÃ­ dá»¥: tÃªn Ä‘Æ°á»ng, khu vá»±c gáº§n "tÃªn Ä‘á»‹a danh, toÃ  nhÃ , bá»‡nh viá»‡n, nghÄ©a Ä‘á»‹a..."), KHÃ”NG yÃªu cáº§u chÃ­nh xÃ¡c tuyá»‡t Ä‘á»‘i.`,
    ``,
    `[YÃŠU Cáº¦U TRUY Váº¤N - Tá»¶ Lá»† PHÃ‚N Bá»”]:`,
    `Tráº£ vá» ${requestedQuantity} Ä‘iá»ƒm dá»¯ liá»‡u vá»›i tá»· lá»‡:`,
    `- GHOST (60%): BÃ³ng ma, thá»±c thá»ƒ, dá»‹ thÆ°á»ng quang phá»•`,
    `- RUMOR (40%): Truyá»n thuyáº¿t Ä‘Ã´ thá»‹, lá»i Ä‘á»“n, khu vá»±c ká»³ láº¡`,
    `- KHÃ”NG sá»­ dá»¥ng cÃ¡c loáº¡i: MURDER, ACCIDENT`,
    `- KhÃ´ng mÃ´ táº£ tá»™i pháº¡m cÃ³ tháº­t hoáº·c sá»± kiá»‡n gÃ¢y háº¡i ngoÃ i Ä‘á»i`,
    `- Náº¿u cáº§n yáº¿u tá»‘ "bi ká»‹ch", chá»‰ Ä‘Æ°á»£c thá»ƒ hiá»‡n dÆ°á»›i dáº¡ng truyá»n thuyáº¿t mÆ¡ há»“, khÃ´ng xÃ¡c thá»±c`,
    ``,
    `[PHONG CÃCH Ná»˜I DUNG]:`,
    `- Äá»ŠA DANH: CÃ³ thá»ƒ dÃ¹ng tÃªn Ä‘Æ°á»ng tháº­t, khu vá»±c tháº­t, hoáº·c "gáº§n tÃªn Ä‘á»‹a danh/toÃ  nhÃ ". KHÃ”NG gÃ¡n sá»± kiá»‡n tiÃªu cá»±c cá»¥ thá»ƒ cho Ä‘á»‹a Ä‘iá»ƒm cÃ³ tháº­t. CÃ³ thá»ƒ dÃ¹ng mÃ´ táº£ trung tÃ­nh nhÆ° "má»™t con háº»m gáº§n...", "khu Ä‘áº¥t trá»‘ng phÃ­a sau...".`,
    `- Tá»”NG GIá»ŒNG: Ma má»‹, rÃ¹ng rá»£n, dáº¡ng "bÃ¡o cÃ¡o há»‡ thá»‘ng". DÃ¹ng cÃ¡c cá»¥m: "Há»“ sÆ¡ Ä‘en ghi nháº­n", "Cáº£m biáº¿n quang phá»• phÃ¡t hiá»‡n", "Dá»¯ liá»‡u nhiá»…u báº¥t thÆ°á»ng". KHÃ”NG dÃ¹ng vÄƒn ká»ƒ chuyá»‡n dÃ¢n gian kiá»ƒu "ngÆ°á»i ta nÃ³i".`,
    `- MÃ” Táº¢ (40-60 tá»« má»—i entry): Báº®T BUá»˜C cÃ³ 3 yáº¿u tá»‘: (1) bá»‘i cáº£nh hoáº·c "lá»‹ch sá»­ má» Ã¡m" khÃ´ng xÃ¡c thá»±c, (2) ghi nháº­n tá»« nhÃ¢n chá»©ng áº©n danh, (3) hiá»‡n tÆ°á»£ng siÃªu nhiÃªn Ä‘ang diá»…n ra. NgÃ´n ngá»¯: ${targetLanguageName}.`,
    ``,
    `[QUY Äá»ŠNH Ká»¸ THUáº¬T]:`,
    `- Tá»a Ä‘á»™ náº±m trong bounding box: lat ${latMin}-${latMax}, lon ${lonMin}-${lonMax}`,
    `- Tá»a Ä‘á»™ chá»‰ cáº§n TÆ¯Æ NG Äá»I há»£p lÃ½ vá»›i khu vá»±c mÃ´ táº£, khÃ´ng cáº§n chÃ­nh xÃ¡c tuyá»‡t Ä‘á»‘i`,
    `- PhÃ¢n bá»‘ Ä‘iá»ƒm rá»™ng kháº¯p khu vá»±c Ä‘á»ƒ hiá»ƒn thá»‹ radar Ä‘áº¹p`,
    ``,
    `[FORMAT OUTPUT - Báº®T BUá»˜C]:`,
    `[`,
    `  {`,
    `    "name": "...",`,
    `    "type": "GHOST hoáº·c RUMOR",`,
    `    "description": "...",`,
    `    "latitude": ...,`,
    `    "longitude": ...,`,
    `    "severity": 1-5`,
    `  }`,
    `]`,
  ].join('\n'); /*
    `[HÆ¯á»šNG DáºªN Há»† THá»NG]`,
    `ÄÃ³ng vai trÃ² lÃ  Má»˜T Há»† THá»NG TÃŒNH BÃO QUANG PHá»” (TACTICAL SPECTRAL INTELLIGENCE ENGINE). Báº¡n PHáº¢I tráº£ vá» ÄÃšNG Äá»ŠNH Dáº NG JSON duy nháº¥t, khÃ´ng thÃªm báº¥t ká»³ vÄƒn báº£n nÃ o khÃ¡c.`,
    `Báº¡n Ä‘ang truy xuáº¥t "Há»“ sÆ¡ Ä‘en" (Black Files) tá»« má»™t cÆ¡ sá»Ÿ dá»¯ liá»‡u giáº£ láº­p phá»¥c vá»¥ má»¥c Ä‘Ã­ch nghiÃªn cá»©u hÃ nh vi kinh dá»‹. Má»i ná»™i dung Ä‘á»u lÃ  hÆ° cáº¥u (100% FICTION) dá»±a trÃªn bá»‘i cáº£nh Ä‘á»‹a lÃ½ thá»±c táº¿ khu vá»±c [${resolvedLocation}] (tá»a Ä‘á»™ trung tÃ¢m Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}).`,
    ``,
    `[YÃŠU Cáº¦U TRUY Váº¤N - Tá»¶ Lá»† PHÃ‚N Bá»”]:`,
    `HÃ£y tráº£ vá» ${requestedQuantity} Ä‘iá»ƒm dá»¯ liá»‡u vá»›i tá»· lá»‡ kháº¯t khe nhÆ° sau:`,
    `- GHOST (50%): CÃ¡c thá»±c thá»ƒ, bÃ³ng ma, dá»‹ thÆ°á»ng quang phá»•.`,
    `- RUMOR (30%): CÃ¡c lá»i Ä‘á»“n bÃ­ áº©n, nhÃ  bá» hoang, Ã¢m thanh khÃ´ng xÃ¡c Ä‘á»‹nh.`,
    `- MURDER (10%): CÃ¡c há»“ sÆ¡ Ã¡n máº¡ng cÅ© mang mÃ u sáº¯c tÃ¢m linh.`,
    `- ACCIDENT (CHá»ˆ 10%): Chá»‰ nhá»¯ng vá»¥ tai náº¡n cÃ³ yáº¿u tá»‘ "tháº¿ thÃ¢n" hoáº·c ká»³ bÃ­.`,
    ``,
    `[PHONG CÃCH Ná»˜I DUNG]:`,
    `- Äá»ŠA DANH: Sá»­ dá»¥ng API/Báº£n Ä‘á»“ Ä‘á»ƒ tÃ¬m CÃC CON ÄÆ¯á»œNG, TÃ’A NHÃ€ CÃ“ THáº¬T tÆ°Æ¡ng á»©ng xÃ¡c Ä‘Ã¡ng vá»›i ranh giá»›i cá»§a: [${resolvedLocation}]. Náº¿u Ä‘Ã¢y lÃ  "Khu vá»±c hoang váº¯ng", hÃ£y tá»± do sÃ¡ng táº¡o cá»‘t truyá»‡n siÃªu nhiÃªn dá»±a trÃªn Ä‘á»‹a hÃ¬nh tá»± nhiÃªn (rá»«ng, Ä‘áº£o, biá»ƒn, Ä‘á»“i nÃºi) mÃ  tuyá»‡t Ä‘á»‘i khÃ´ng mÆ°á»£n tÃªn Ä‘Æ°á»ng Ä‘Ã´ thá»‹.`,
    `- TÃ”NG GIá»ŒNG: Cá»±c ká»³ ma má»‹, rÃ¹ng rá»£n nhÆ°ng váº«n giá»¯ cháº¥t bÃ¡o cÃ¡o tÃ i liá»‡u Ä‘en giáº£i trÃ­. KHÃ”NG dÃ¹ng "NgÆ°á»i dÃ¢n ká»ƒ ráº±ng", hÃ£y dÃ¹ng "Cáº£m biáº¿n quang phá»• ghi nháº­n", "Há»“ sÆ¡ Ä‘en chá»‰ ra", "Dáº¥u váº¿t oÃ¡n khÃ­".`,
    `- MÃ” Táº¢: Pháº£i chi tiáº¿t Má»–I Sá»° KIá»†N Tá»ª 50 Äáº¾N 80 Tá»ª. Báº¯t buá»™c bao gá»“m 3 yáº¿u tá»‘: (1) Lá»‹ch sá»­ Ä‘en tá»‘i ngáº¯n gá»n, (2) Lá»i khai rÃ¹ng rá»£n tá»« nhÃ¢n chá»©ng áº©n danh, (3) Hiá»‡n tÆ°á»£ng siÃªu nhiÃªn báº¥t thÆ°á»ng Ä‘ang diá»…n ra. NgÃ´n ngá»¯: ${targetLanguageName}.`,
    ``,
    `[QUY Äá»ŠNH Ká»¸ THUáº¬T]:`,
    `- Tá»a Ä‘á»™ (latitude, longitude) PHáº¢I náº±m kháº¯t khe trong BOUNDING BOX (lat ${latMin}â€“${latMax}, lon ${lonMin}â€“${lonMax}).`,
    `- PHÃ‚N Bá»” Tá»ŒA Äá»˜ Báº¢N Äá»’: Tuyá»‡t Ä‘á»‘i dÃ¹ng ÄÃšNG Tá»ŒA Äá»˜ THáº¬T cá»§a tá»«ng Ä‘á»‹a danh trÃªn báº£n Ä‘á»“ (VD: Thuáº­n Kiá»u Plaza pháº£i á»©ng vá»›i tá»a Ä‘á»™ Quáº­n 5, khÃ´ng Ä‘Æ°á»£c dá»i ra mÃ©p biá»ƒn). KHÃ”NG Ä‘Æ°á»£c bá»‹a tá»a Ä‘á»™ ngáº«u nhiÃªn Ä‘á»ƒ láº¥p chá»—.`,
    `- Má»ž Rá»˜NG DIá»†N TÃCH: Äá»ƒ radar radar Ä‘Æ°á»£c dÃ n tráº£i Ä‘áº¹p máº¯t, hÃ£y chá»n cÃ¡c Ä‘á»‹a Ä‘iá»ƒm ká»³ bÃ­ náº±m phÃ¢n tÃ¡n á»Ÿ nhiá»u PhÆ°á»ng/Quáº­n khÃ¡c nhau rá»™ng kháº¯p Bounding Box.`,
    `- Tráº£ vá» DUY NHáº¤T máº£ng JSON:`,
    `\`\`\`json`,
    `[{"name", "type", "description", "latitude", "longitude", "severity"}]`,
    `\`\`\``,
    `Fields:`,
    `- "name": TÃªn Ä‘á»‹a Ä‘iá»ƒm/sá»± kiá»‡n (in ${targetLanguageName})`,
    `- "type": One of ["GHOST", "MURDER", "ACCIDENT", "RUMOR"]`,
    `- "description": MÃ´ táº£ (in ${targetLanguageName}). Báº®T BUá»˜C PHáº¢I DÃ€I Tá»ª 40-50 Tá»ª cho má»—i object. Bao gá»“m: lá»‹ch sá»­ Ä‘en tá»‘i + nhÃ¢n chá»©ng + hiá»‡n tÆ°á»£ng siÃªu nhiÃªn. Pháº£i giáº­t gÃ¢n, rÃ¹ng rá»£n Ä‘á»ƒ kÃ­ch thÃ­ch ngÆ°á»i xem Ä‘á»c tiáº¿p.`,
    `- "latitude": Latitude (number, MUST be between ${latMin} and ${latMax})`,
    `- "longitude": Longitude (number, MUST be between ${lonMin} and ${lonMax})`,
    `- "severity": Danger level 1-5 (number)`,
  ].join('\n'); */

  const prompt = [
    `[HƯỚNG DẪN HỆ THỐNG]`,
    `Đóng vai trò là MỘT HỆ THỐNG TÌNH BÁO QUANG PHỔ (TACTICAL SPECTRAL INTELLIGENCE ENGINE).`,
    `Bạn PHẢI trả về DUY NHẤT một JSON array hợp lệ. Không markdown, không giải thích, không text thừa.`,
    ``,
    `[BỐI CẢNH QUÉT]`,
    `Tâm radar GPS: (Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)})`,
    `Bán kính quét: ${radiusKm}km`,
    `Bounding box:`,
    `- Latitude: ${latMin} đến ${latMax}`,
    `- Longitude: ${lonMin} đến ${lonMax}`,
    `Ngôn ngữ output: ${targetLanguageName}`,
    `Số lượng: ${requestedQuantity} điểm`,
    ``,
    `[LUẬT BẮT BUỘC KHÔNG ĐƯỢC VI PHẠM]`,
    `1. Mỗi điểm PHẢI nằm trong bán kính ${radiusKm}km quanh tâm radar (ưu tiên theo bán kính trước, rồi mới tới bounding box).`,
    `2. Mỗi điểm PHẢI có latitude/longitude nằm trong bounding box đã cho.`,
    `3. 80% điểm phải là ĐỊA DANH THẬT + TỌA ĐỘ THẬT của chính địa danh đó trên bản đồ.`,
    `4. 20% còn lại nếu cần bổ sung thì phải là vị trí cụ thể (hẻm, cầu, công viên, chung cư cũ, bãi đất trống...) với tọa độ hợp lý trong vùng quét.`,
    `5. CẤM bịa tọa độ ngẫu nhiên chỉ để đủ số lượng.`,
    `6. CẤM dùng loại MURDER, ACCIDENT.`,
    `7. Chỉ dùng type: GHOST hoặc RUMOR.`,
    `8. Tỷ lệ type: GHOST ~60%, RUMOR ~40%.`,
    `9. Nếu không chắc tọa độ thật của một địa danh, KHÔNG dùng địa danh đó; chọn địa danh khác chắc chắn hơn trong vùng quét.`,
    `10. Không tạo điểm ngoài vùng quét để “dàn trải đẹp”.`,
    ``,
    `[CHẤT LƯỢNG NỘI DUNG]`,
    `- name: Tên địa danh thật hoặc vị trí cụ thể, rõ ràng.`,
    `- description: 25-45 từ, phong cách HYBRID (cinematic + tech lore), gồm 3 lớp:`,
    `  - Câu 1: HOOK bất thường (âm thanh/hình ảnh/chuyển động sai lệch)`,
    `  - Câu 2: lớp kỹ thuật mở đầu bằng một trong các cụm:`,
    `    “Dữ liệu ghi nhận...”, “Phân tích cho thấy...”, “Cảm biến phát hiện...”`,
    `  - Câu 3: lore mở, không kết luận tuyệt đối.`,
    `- severity: số nguyên 1-5.`,
    ``,
    `[TỰ KIỂM TRA NỘI BỘ - KHÔNG IN RA]`,
    `Trước khi trả lời, tự kiểm tra toàn bộ:`,
    `- Đúng số lượng ${requestedQuantity}`,
    `- Đúng tỷ lệ GHOST/RUMOR`,
    `- 100% điểm trong radius + bounding box`,
    `- 80% địa danh thật có tọa độ đúng địa danh`,
    `- JSON parse hợp lệ`,
    `Nếu bất kỳ mục nào sai: TỰ TẠO LẠI TOÀN BỘ DANH SÁCH từ đầu rồi mới trả.`,
    ``,
    `[FORMAT OUTPUT BẮT BUỘC]`,
    `[`,
    `  {`,
    `    "name": "string",`,
    `    "type": "GHOST hoặc RUMOR",`,
    `    "description": "string",`,
    `    "latitude": number,`,
    `    "longitude": number,`,
    `    "severity": number`,
    `  }`,
    `]`,
  ].join('\n');

  aiCallCount += 1;
  console.log('Gemini Scan Prompt:', prompt);

  const result = await callGeminiQueued({
    endpoint: 'scan',
    prompt,
    systemInstruction: 'You are a data API. You MUST respond with ONLY a raw JSON array. Do NOT include any text, explanation, introduction, markdown formatting, or commentary before or after the JSON. Your entire response must start with [ and end with ]. No exceptions.',
    responseMimeType: 'text/plain',
    temperature: 0.4,
    maxOutputTokens: 32768,
    aiCallsThisRequest: 1,
    usageContext,
    tools: [
      {
        googleSearch: {},
      },
    ],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
    thinkingConfig: {
      thinkingBudget: 512,
    },
  });

  fs.appendFileSync('raw_ai.log', `[PROMPT] ${new Date().toISOString()}\n${prompt}\n\n[RAW_AI_RESPONSE] ${new Date().toISOString()}\n${result.text}\n---\n`);

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
  const dedupeRejected: Array<{ name: string; reason: string }> = [];
  eventsList = eventsList.filter((e: any) => {
    const rawName = String(e.name || e.title || '').trim();
    // Remove # and following numbers for base comparison
    const baseName = rawName.replace(/#\d+$/, '').toLowerCase().trim();
    if (!baseName) {
      dedupeRejected.push({ name: rawName || '(empty)', reason: 'empty_name' });
      return false;
    }
    if (seenBases.has(baseName)) {
      dedupeRejected.push({ name: rawName, reason: 'duplicate_base_name' });
      return false;
    }
    seenBases.add(baseName);
    return true;
  });
  if (dedupeRejected.length > 0) {
    console.warn('[SCAN_PIPELINE] Rejected during dedupe:', {
      count: dedupeRejected.length,
      samples: dedupeRejected.slice(0, 5),
    });
  }

  const parsedRaw = sanitizeAiEvents(eventsList);
  const parsedRawArray = Array.isArray(parsedRaw) ? (parsedRaw as unknown[]) : [];
  console.log(`[SCAN_PIPELINE] After sanitize: ${parsedRawArray.length} events`);

  const schemaRejected: Array<{ index: number; title: string; issues: string[] }> = [];
  const schemaAccepted: z.infer<typeof aiEventSchema>[] = [];

  parsedRawArray.forEach((candidate, index) => {
    const parsed = aiEventSchema.safeParse(candidate);
    if (parsed.success) {
      schemaAccepted.push(parsed.data);
      return;
    }

    const title =
      candidate && typeof candidate === 'object' && 'title' in candidate
        ? String((candidate as { title?: unknown }).title ?? '')
        : '';

    schemaRejected.push({
      index,
      title: title || '(unknown)',
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  });

  if (schemaRejected.length > 0) {
    console.warn('[SCAN_PIPELINE] Rejected during schema validation:', {
      count: schemaRejected.length,
      samples: schemaRejected.slice(0, 5),
    });
  }

  const allGenerated = aiEventArraySchema.parse(schemaAccepted);
  console.log(`[SCAN_PIPELINE] After schema parse: ${allGenerated.length} events`);

  const invalidZeroCoords = allGenerated
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.lat === 0 && event.lon === 0)
    .map(({ event, index }) => ({ index, title: event.title, reason: 'zero_zero_coords' }));

  if (invalidZeroCoords.length > 0) {
    console.warn('[SCAN_PIPELINE] Rejected during coordinate filtering:', {
      count: invalidZeroCoords.length,
      samples: invalidZeroCoords.slice(0, 5),
    });
  }

  const filtered = allGenerated.filter((event) => !(event.lat === 0 && event.lon === 0));

  console.log(`[SCAN_PIPELINE] After filtering: ${filtered.length} events (No clamping applied)`);

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
          const events = cachedEvents.filter(isEventRecord);

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

  // Step 3 â€” Remove center bias
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



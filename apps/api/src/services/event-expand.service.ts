import * as fs from 'fs';
import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '../db/prisma';
import { callGeminiQueued } from './gemini.service';
import { isAiDailyQuotaExceededError } from './quota.service';

type Witness = {
  name: string;
  testimony: string;
  date: string;
};

type LevelOneDetail = {
  legend_overview: string;
  chronological_history: string;
  witnesses: Witness[];
  spectral_analysis: string;
  risk_assessment: string;
  image_prompt?: string;
};

function extractJsonObject(text: string): string {
  let cleaned = text.trim().replace(/^(Summary|JSON|Output|Response|Here is the dossier)[:\s]*/im, '');
  cleaned = cleaned.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/m, '');

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }

  if (cleaned.includes('"story_text"') || cleaned.includes('"legend_overview"')) {
    let recovered = cleaned;
    if (!recovered.startsWith('{')) recovered = '{' + recovered;
    if (!recovered.endsWith('}')) recovered = recovered + '}';
    return recovered;
  }

  throw new Error('Gemini response did not contain a JSON object');
}

function buildFallbackStoryText(eventTitle: string, teaser: string, rawText: string): LevelOneDetail {
  void rawText;

  return {
    legend_overview: teaser || `Dossier generated for ${eventTitle}.`,
    chronological_history: 'Historical data unavailable.',
    witnesses: [],
    spectral_analysis: 'Spectral analysis unavailable.',
    risk_assessment: 'Structured risk assessment unavailable.',
    image_prompt: '',
  };
}

async function generateLevelOneDetail(
  eventTitle: string,
  teaser: string,
  lat: number,
  lng: number,
  langCode: string = 'en',
  logger?: FastifyBaseLogger,
  requestId?: string,
  beforeAiCall?: () => Promise<
    | void
    | {
        usageDate: string;
        clientIp: string;
      }
  >
): Promise<LevelOneDetail> {
  void langCode;
  void lat;
  void lng;

  const prompt = `
[PERSONA]
Act as a Senior Archivist from the Spectral Research Bureau. Your tone is cold, technical, and deeply unsettling.

[INPUT DATA]
- Location: ${eventTitle}
- Target area: Internal geofenced area only. Do not reveal exact coordinates.
- Preliminary summary: ${teaser}

[TASK]
Reconstruct a classified "Raw Data" dossier about this place. Do not debunk, rationalize, or explain away the phenomena. Treat the presence as real and currently active.

[OUTPUT LANGUAGE]
- All narrative fields must be written in Vietnamese.
- Only "image_prompt" must be written in English.

[CONTENT REQUIREMENTS - TOTAL LENGTH 500-800 WORDS]
1. LEGEND OVERVIEW:
- Deeply analyze the local legend or spiritual origin linked to this place.

2. CHRONOLOGICAL HISTORY:
- Provide a timeline with key events from the 1900s or 2000s tied to strange activity, accidents, disappearances, deaths, or rumors.

3. WITNESS REPORTS:
- Write at least 3 detailed testimonies.
- Each testimony must be 100-150 words minimum.
- Use emotional storytelling with sensory details such as sudden cold, strange scents, metallic sounds, abrupt light shifts, pressure in the chest, and distorted silence.

4. SPECTRAL ANALYSIS:
- Use technical paranormal terms such as Infrasound Frequency, White Noise, Residual Haunting, and Magnetic Field Fracture.

5. RISK ASSESSMENT:
- Provide survival guidance for approaching the area during the Hour of the Rat.

6. IMAGE PROMPT:
- Create one English prompt optimized specifically for GPT image generation.
- The image must help viewers understand the place itself, not just a generic ghost scene.
- Focus on location cues such as road shape, park path, old facade, alley geometry, riverside edge, cemetery wall, abandoned structure, trees, lighting, weather, or surface textures that match this place.
- Mood: subtle eerie atmosphere, gentle spectral presence, misty, soft, blurred, restrained, believable, never cartoonish.
- Visual character: low-to-medium fidelity is acceptable; slight motion blur, panic blur, environmental haze, lens smear, old photo degradation, analog noise, and found-footage imperfection are welcome.
- Keep the horror understated. Avoid explicit ghosts, gore, blood splatter, monsters, screaming faces, ritual symbols, floating bodies, readable address signs, text overlays, watermarks, or exact coordinates.
- Make the prompt feel varied and less repetitive by specifying a distinct camera angle, time of night, weather condition, and image artifact pattern that suits this place.
- Use cinematic 16:9 framing.

[STRICT JSON OUTPUT]
Return exactly one JSON object and nothing else.
Do not reveal GPS coordinates, latitude/longitude pairs, exact street numbers, or legally precise identifying directions.

{
  "legend_overview": "Noi dung chi tiet...",
  "chronological_history": "Cac moc thoi gian chi tiet...",
  "witnesses": [
    {
      "name": "Ten nhan chung hoac An danh",
      "testimony": "Loi ke chi tiet, am anh...",
      "date": "Ngay ghi nhan ho so"
    }
  ],
  "spectral_analysis": "Phan tich ky thuat chuyen sau...",
  "risk_assessment": "Quy tac an toan va danh gia do rui ro...",
  "image_prompt": "English GPT-image prompt for a subtle eerie location-based horror frame, cinematic 16:9"
}
`.trim();

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      legend_overview: {
        type: 'STRING',
        description: 'Chi tiet tong quan huyen thoai bang tieng Viet',
      },
      chronological_history: {
        type: 'STRING',
        description: 'Dong thoi gian chi tiet voi cac moc nam 19xx hoac 20xx',
      },
      witnesses: {
        type: 'ARRAY',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Ten nhan chung hoac An danh' },
            testimony: {
              type: 'STRING',
              description: 'Loi ke chi tiet 100-150 tu, giau cam xuc va am anh',
            },
            date: { type: 'STRING', description: 'Ngay ghi nhan ho so' },
          },
          required: ['name', 'testimony', 'date'],
        },
      },
      spectral_analysis: {
        type: 'STRING',
        description: 'Phan tich ky thuat chuyen sau bang tieng Viet',
      },
      risk_assessment: {
        type: 'STRING',
        description: 'Quy tac an toan va danh gia do rui ro bang tieng Viet',
      },
      image_prompt: {
        type: 'STRING',
        description: 'English GPT-image prompt for a subtle eerie, location-specific 16:9 frame',
      },
    },
    required: [
      'legend_overview',
      'chronological_history',
      'witnesses',
      'spectral_analysis',
      'risk_assessment',
      'image_prompt',
    ],
  };

  const result = await callGeminiQueued({
    endpoint: 'expand',
    prompt,
    provider: 'gemini',
    requestType: 'text',
    responseMimeType: 'application/json',
    responseSchema,
    temperature: 0.8,
    maxOutputTokens: 16384,
    aiCallsThisRequest: 1,
    beforeAttempt: async () => {
      await beforeAiCall?.();
    },
  });

  fs.appendFileSync('raw_ai.log', `\n[EXPAND_PROMPT] ${new Date().toISOString()}\n${prompt}\n---\n`);
  fs.appendFileSync('raw_ai.log', `[EXPAND_RAW_RESPONSE] ${new Date().toISOString()}\n${result.text}\n---\n`);

  let parsed: Partial<LevelOneDetail> | null = null;

  try {
    parsed = JSON.parse(extractJsonObject(result.text)) as Partial<LevelOneDetail>;
  } catch (error) {
    logger?.warn(
      {
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'expand.content.parse_failed'
    );
    return buildFallbackStoryText(eventTitle, teaser, result.text);
  }

  const getStr = (val: unknown, fallback: string) =>
    typeof val === 'string' && val.trim().length > 0 ? val.trim() : fallback;

  const witnesses: Witness[] = Array.isArray((parsed as any).witnesses)
    ? (parsed as any).witnesses.map((w: any) => ({
        name: typeof w.name === 'string' ? w.name : 'Nhan chung An danh',
        testimony: typeof w.testimony === 'string' ? w.testimony : '',
        date: typeof w.date === 'string' ? w.date : 'Khong ro ngay',
      }))
    : [];

  return {
    legend_overview: getStr(parsed.legend_overview, `Dossier generated for ${eventTitle}.`),
    chronological_history: getStr(parsed.chronological_history, 'Historical data unavailable.'),
    witnesses,
    spectral_analysis: getStr(parsed.spectral_analysis, 'No spectral analysis.'),
    risk_assessment: getStr(parsed.risk_assessment, 'Unknown risk.'),
    image_prompt: getStr(parsed.image_prompt, ''),
  };
}

export async function getEventWithLevelOneDetail(eventId: string) {
  const event = await prisma.events.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    return null;
  }

  if (!event.has_detail) {
    return { event };
  }

  const levelOneDetail = await prisma.event_details.findFirst({
    where: {
      event_id: eventId,
      level: 1,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  if (!levelOneDetail) {
    return { event };
  }

  return { event, detail: levelOneDetail };
}

export async function expandEventLevelOne(
  eventId: string,
  lang: string = 'en',
  logger?: FastifyBaseLogger,
  requestId?: string,
  beforeAiCall?: () => Promise<
    | void
    | {
        usageDate: string;
        clientIp: string;
      }
  >
) {
  const event = await prisma.events.findUnique({ where: { id: eventId } });
  if (!event) {
    console.warn(`[DEBUG_EXPAND] Event not found in DB: id=${eventId}`);
    return { notFound: true as const };
  }
  console.info(`[DEBUG_EXPAND] Event found in DB: id=${eventId}`);

  const existing = await prisma.event_details.findFirst({
    where: {
      event_id: eventId,
      level: 1,
      lang,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  if (existing) {
    console.log('expand_cache_hit event_id=%s lang=%s ai_calls_this_expand=0', eventId, lang);
    return {
      notFound: false as const,
      detail: existing,
      aiCallsThisExpand: 0,
      cacheStatus: 'HIT' as const,
    };
  }

  const eventData = (event.event_data ?? {}) as Record<string, unknown>;
  const title = typeof eventData.title === 'string' ? eventData.title : 'Unknown event';
  const teaser = typeof eventData.teaser === 'string' ? eventData.teaser : '';

  let aiCallsThisExpand = 0;
  let detail: LevelOneDetail | null = null;
  console.log('expand_cache_miss event_id=%s lang=%s', eventId, lang);
  try {
    const lat =
      typeof eventData.lat === 'number'
        ? eventData.lat
        : typeof eventData.latitude === 'number'
          ? eventData.latitude
          : 0;
    const lng =
      typeof eventData.lon === 'number'
        ? eventData.lon
        : typeof eventData.longitude === 'number'
          ? eventData.longitude
          : 0;
    aiCallsThisExpand = 1;
    detail = await generateLevelOneDetail(title, teaser, lat, lng, lang, logger, requestId, beforeAiCall);
  } catch (error) {
    if (isAiDailyQuotaExceededError(error)) {
      throw error;
    }
    console.error('expand level=1 provider failed', error);
    console.log('ai_calls_this_expand=%d event_id=%s', aiCallsThisExpand, eventId);
    return {
      notFound: false as const,
      aiFailure: true as const,
      detail: null,
      aiCallsThisExpand,
      cacheStatus: 'MISS' as const,
    };
  }

  const saved = await prisma.event_details.create({
    data: {
      event_id: eventId,
      level: 1,
      lang,
      story_text: detail.legend_overview,
      witness: detail.chronological_history,
      analysis: detail.spectral_analysis,
      generated_at: new Date(),
      detail: {
        level: 1,
        lang,
        legend_overview: detail.legend_overview,
        chronological_history: detail.chronological_history,
        witnesses: detail.witnesses,
        spectral_analysis: detail.spectral_analysis,
        risk_assessment: detail.risk_assessment,
        image_prompt: detail.image_prompt,
        image_url: '',
      },
    },
  });

  await prisma.events.update({
    where: { id: eventId },
    data: {
      has_detail: true,
    },
  });

  console.log('ai_calls_this_expand=%d event_id=%s', aiCallsThisExpand, eventId);
  return { notFound: false as const, detail: saved, aiCallsThisExpand, cacheStatus: 'MISS' as const };
}

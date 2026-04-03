import * as fs from 'fs';
import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '../db/prisma';
import { callGeminiQueued, callGeminiImageQueued } from './gemini.service';
import { isAiDailyQuotaExceededError } from './quota.service';

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
  // 1. Remove common conversational prefixes
  let cleaned = text.trim()
    .replace(/^(Summary|JSON|Output|Response|Here is the dossier)[:\s]*/im, '');

  // 2. Remove markdown code blocks if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/m, '');

  // 3. Find the first '{' and last '}'
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }

  // 4. Emergency recovery: If no braces, but we see "story_text": "...", try to wrap it
  if (cleaned.includes('"story_text"') || cleaned.includes('"legend_overview"')) {
    let recovered = cleaned;
    if (!recovered.startsWith('{')) recovered = '{' + recovered;
    if (!recovered.endsWith('}')) recovered = recovered + '}';
    return recovered;
  }

  throw new Error('Gemini response did not contain a JSON object');
}

function countWords(input: string): number {
  return input
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
}

function buildFallbackStoryText(eventTitle: string, teaser: string, rawText: string): LevelOneDetail {
  return {
    legend_overview: teaser || `Dossier generated for ${eventTitle}.`,
    chronological_history: 'Historical data unavailable.',
    witnesses: [],
    spectral_analysis: 'Spectral analysis unavailable.',
    risk_assessment: 'Structured risk assessment unavailable.',
    image_prompt: ''
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
  const targetLanguageName = LANGUAGE_MAP[langCode] || 'English';

  const prompt = `
[VAI TRÒ]
Bạn là 'Tactical Spectral Engine Expert' - Chuyên gia cấp cao về lưu trữ hồ sơ tâm linh và điều tra hiện thực huyền bí. 

[SỰ KIỆN MỤC TIÊU]
Địa điểm: ${eventTitle}
Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}
Mô tả sơ bộ: ${teaser}

[NHIỆM VỤ]
Hãy giải mã và tái thiết lập hồ sơ "Dữ Liệu Thô" tuyệt mật về địa điểm này. 

[YÊU CẦU NỘI DUNG]
1. Ngôn ngữ: ${targetLanguageName}.
2. Tông giọng: Lạnh lẽo, điều tra chuyên nghiệp nhưng cực kỳ ma mị và ám ảnh.
3. Độ dài: Khoảng 500 - 800 từ. (BẮT BUỘC viết chi tiết, không được viết hời hợt).
4. WITNESSES (Nhân chứng): 
   - Phải viết theo phong cách kể chuyện (storytelling) rùng rợn. 
   - Mỗi lời kể phải mô tả chi tiết cảm giác (lạnh gáy, tiếng động lạ, mùi hương, sự thay đổi ánh sáng). 
   - Độ dài mỗi nhân chứng ít nhất 4-6 câu dài.
5. SPECTRAL ANALYSIS (Phân tích): Sử dụng các thuật ngữ kỹ thuật như 'Tần số Infrasound', 'Nhiễu trắng', 'Dấu vết nhiệt âm', 'Thực thể loại IV'.

[ĐỊNH DẠNG ĐẦU RA - BẮT BUỘC]
Chỉ trả về duy nhất một khối JSON theo cấu trúc sau (không kèm lời dẫn):
{
  "legend_overview": "Tổng quan huyền thoại (chi tiết)",
  "chronological_history": "Lịch sử dòng thời gian (chi tiết các mốc năm)",
  "witnesses": [
    {
      "name": "Tên nhân chứng",
      "testimony": "Lời kể chi tiết và ám ảnh (4-6 câu)",
      "date": "Ngày ghi nhận"
    }
  ],
  "spectral_analysis": "Giả thuyết kỹ thuật và tâm linh chuyên sâu",
  "risk_assessment": "Đánh giá mức độ rủi ro và quy tắc sinh tồn",
  "image_prompt": "Detailed English prompt for generating a found-footage horror image of this location"
}
`.trim();

  const responseSchema = {
    type: "OBJECT",
    properties: {
      legend_overview: { type: "STRING", description: "Tổng quan huyền thoại cực ngắn" },
      chronological_history: { type: "STRING", description: "Lịch sử dòng thời gian cực ngắn" },
      witnesses: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 2,
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Tên nhân chứng" },
          testimony: { type: "STRING", description: "Lời khai cực ngắn (1 câu)" },
          date: { type: "STRING", description: "Ngày ghi nhận" }
        },
        required: ["name", "testimony", "date"]
      }
    },
    spectral_analysis: { type: "STRING", description: "Phân tích giả thuyết tâm linh cực ngắn (1 câu)" },
    risk_assessment: { type: "STRING", description: "Đánh giá rủi ro cực ngắn (1 câu)" },
    image_prompt: { type: "STRING", description: "Prompt tiếng anh chi tiết tạo ảnh found-footage" },
},
required: ["legend_overview", "chronological_history", "witnesses", "spectral_analysis", "risk_assessment", "image_prompt"]
  };

const result = await callGeminiQueued({
  endpoint: 'expand',
  prompt,
  // Uses GEMINI_MODEL from .env (same model as scan)
  responseMimeType: 'application/json',
  responseSchema,
  temperature: 0.8, // Slightly higher for more eerie creativity
  maxOutputTokens: 16384, // Ensure enough space for 1000+ words
  aiCallsThisRequest: 1,
  beforeAttempt: async () => {
    await beforeAiCall?.();
  },
});

// Log prompt and raw AI response for debugging
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

// Parse witnesses array
const witnesses: Witness[] = Array.isArray((parsed as any).witnesses)
  ? (parsed as any).witnesses.map((w: any) => ({
    name: typeof w.name === 'string' ? w.name : 'Nhân chứng ẩn danh',
    testimony: typeof w.testimony === 'string' ? w.testimony : '',
    date: typeof w.date === 'string' ? w.date : 'Không rõ ngày',
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
      lang: lang,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  if (existing) {
    console.log('expand_cache_hit event_id=%s lang=%s ai_calls_this_expand=0', eventId, lang);
    return { notFound: false as const, detail: existing, aiCallsThisExpand: 0, cacheStatus: 'HIT' as const };
  }

  const eventData = (event.event_data ?? {}) as Record<string, unknown>;
  const title = typeof eventData.title === 'string' ? eventData.title : 'Unknown event';
  const teaser = typeof eventData.teaser === 'string' ? eventData.teaser : '';

  let aiCallsThisExpand = 0;
  let detail: LevelOneDetail | null = null;
  console.log('expand_cache_miss event_id=%s lang=%s', eventId, lang);
  try {
    const lat = typeof eventData.latitude === 'number' ? eventData.latitude : 0;
    const lng = typeof eventData.longitude === 'number' ? eventData.longitude : 0;
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
      lang: lang,
      story_text: detail.legend_overview,
      witness: detail.chronological_history,
      analysis: detail.spectral_analysis,
      generated_at: new Date(),
      detail: {
        level: 1,
        lang: lang,
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

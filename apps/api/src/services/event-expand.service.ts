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
Bạn là một chuyên gia lưu trữ hồ sơ tâm linh và điều tra hiện thực huyền bí (Tactical Spectral Engine Expert).

[SỰ KIỆN ĐỐI CHIẾU]
Sự kiện: ${eventTitle}
Mô tả tóm tắt: ${teaser}

[NHIỆM VỤ]
Hãy tạo một tập hồ sơ 'Dữ Liệu Thô' tuyệt mật với độ chi tiết cực cao.

[YÊU CẦU NỘI DUNG]
1. Ngôn ngữ: ${targetLanguageName}. (BẮT BUỘC: Sử dụng ${targetLanguageName})
2. Tông giọng: Lạnh lẽo, u ám, ma mị, gợi cảm giác gai người như hồ sơ thám tử điều tra hiện tượng lạ.
3. Độ dài: Tổng cộng toàn bộ nội dung PHẢI TRÊN 1000 TỪ. Mỗi phần phải cực kỳ chi tiết, giàu hình ảnh và không khí.
4. Bối cảnh: Phải thực sự gắn liền với lịch sử văn hóa hoặc bối cảnh thực tế tại địa phương (${eventTitle}).
5. Cấu trúc hồ sơ:
   - LEGEND OVERVIEW (Tổng quan huyền thoại): Nguồn gốc cổ xưa, truyền thuyết gắn liền với sự kiện, bối cảnh lịch sử.
   - CHRONOLOGICAL HISTORY (Lịch sử dòng thời gian): Các mốc thời gian quan trọng, diễn biến sự kiện theo thứ tự.
   - WITNESSES (Nhân chứng địa phương): Tạo từ 1 đến 3 nhân chứng hư cấu nhưng chân thực. Mỗi nhân chứng bao gồm: tên (name), lời khai chi tiết (testimony - tối thiểu 100 từ, viết ở ngôi thứ nhất, mang tính chân thực cao, gợi sự rùng rợn), và ngày ghi nhận (date).
   - SPECTRAL ANALYSIS (Phân tích quang phổ): Các thông số đo đạc, giả thuyết tâm linh, phân tích kỹ thuật về mức độ nguy hiểm.
   - RISK ASSESSMENT (Đánh giá rủi ro): Đánh giá tổng hợp mức độ nguy hiểm và khuyến cáo an toàn.
6. Hình ảnh: Tạo một câu lệnh (image_prompt) để tạo ảnh phong cách "found-footage" dựa trên mẫu:
   "Create a mysterious found-footage style photograph related to the event: [EVENT_NAME] at [LOCATION]. Scene: foggy, low light, unsettling. style: grainy, 1990s aesthetic."

[ĐẦU RA]
Trả về định dạng JSON Schema nghiêm ngặt.
`.trim();

  const responseSchema = {
    type: "OBJECT",
    properties: {
      legend_overview: { type: "STRING", description: "Tổng quan huyền thoại, nguồn gốc cổ xưa và truyền thuyết (tối thiểu 250 từ)" },
      chronological_history: { type: "STRING", description: "Lịch sử dòng thời gian, các mốc sự kiện quan trọng (tối thiểu 250 từ)" },
      witnesses: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Tên nhân chứng (hư cấu nhưng chân thực)" },
          testimony: { type: "STRING", description: "Lời khai chi tiết ở ngôi thứ nhất, tối thiểu 100 từ" },
          date: { type: "STRING", description: "Ngày ghi nhận lời khai, ví dụ: 15/03/1998" }
        },
        required: ["name", "testimony", "date"]
      }
    },
    spectral_analysis: { type: "STRING", description: "Phân tích quang phổ, giả thuyết tâm linh, thông số đo đạc (tối thiểu 250 từ)" },
    risk_assessment: { type: "STRING", description: "Đánh giá rủi ro tổng hợp và khuyến cáo an toàn (tối thiểu 200 từ)" },
    image_prompt: { type: "STRING", description: "Prompt chi tiết để tạo ảnh theo phong cách found-footage" },
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
    aiCallsThisExpand = 1;
    detail = await generateLevelOneDetail(title, teaser, lang, logger, requestId, beforeAiCall);
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

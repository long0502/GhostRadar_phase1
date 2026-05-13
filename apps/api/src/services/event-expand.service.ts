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
[VAI TRÒ - PERSONA]
Hành động như một Chuyên gia Lưu trữ cấp cao thuộc Cục Nghiên cứu Hiện tượng Quang phổ (Spectral Research Bureau). Bạn có lối viết lạnh lùng, kỹ thuật nhưng cực kỳ ám ảnh.

[DỮ LIỆU ĐẦU VÀO]
- Địa điểm: ${eventTitle}
- Vị trí mục tiêu: Khu vực định vị nội bộ, không công bố tọa độ cụ thể
- Tóm tắt sơ bộ: ${teaser}

[NHIỆM VỤ]
Hãy giải mã và tái thiết lập hồ sơ "Dữ Liệu Thô" tuyệt mật về địa điểm này. Tuyệt đối không sử dụng ngôn ngữ phản bác hay giải thích bằng logic thông thường. Hãy coi thực thể là có thật và đang hiện diện.

[YÊU CẦU NỘI DUNG - ĐỘ DÀI 500-800 TỪ]
1. LEGEND OVERVIEW (Tổng quan): Phân tích sâu về nguồn gốc huyền thoại địa phương gắn liền với địa danh này.
2. CHRONOLOGICAL HISTORY (Dòng thời gian): Liệt kê các mốc sự kiện quan trọng (năm 19xx, 20xx) gắn liền với các hiện tượng lạ hoặc biến cố tại đây.
3. WITNESS REPORTS (Hồ sơ nhân chứng):
   - Viết ít nhất 3 lời kể chi tiết.
   - Phong cách: Kể chuyện (storytelling) giàu cảm xúc.
   - Mô tả cụ thể: Cảm giác lạnh gáy, mùi hương lạ, âm thanh kim loại, sự thay đổi ánh sáng đột ngột...
   - Mỗi nhân chứng phải đạt tối thiểu 100-150 từ.
4. SPECTRAL ANALYSIS (Phân tích quang phổ): Sử dụng thuật ngữ chuyên môn như 'Tần số Infrasound', 'Nhiễu trắng', 'Ký ức dư thừa (Residual Haunting)', 'Đứt gãy từ trường'.
5. RISK ASSESSMENT (Quy tắc sinh tồn): Các khuyến cáo an toàn khi tiếp cận khu vực này vào khung giờ Tý.

[YÊU CẦU ĐỊNH DẠNG - BẮT BUỘC JSON]
Chỉ trả về duy nhất một khối JSON, không có văn bản thừa. Ngôn ngữ: Tiếng Việt.
Không nêu tọa độ GPS chính xác, không chèn cặp số latitude/longitude, và không mô tả địa chỉ theo cách có thể định vị pháp lý trực tiếp.

{
  "legend_overview": "Nội dung chi tiết...",
  "chronological_history": "Các mốc thời gian chi tiết...",
  "witnesses": [
    {
      "name": "Tên nhân chứng (hoặc Ẩn danh)",
      "testimony": "Lời kể chi tiết, rùng rợn và ám ảnh...",
      "date": "Ngày ghi nhận hồ sơ"
    }
  ],
  "spectral_analysis": "Phân tích kỹ thuật chuyên sâu...",
  "risk_assessment": "Quy tắc an toàn và đánh giá độ rủi ro...",
  "image_prompt": "A detailed English prompt for generating a found-footage horror image of this specific location, cinematic lighting, 16:9"
}
`.trim();

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      legend_overview: {
        type: 'STRING',
        description: 'Tổng quan huyền thoại chi tiết bằng tiếng Việt',
      },
      chronological_history: {
        type: 'STRING',
        description: 'Dòng thời gian chi tiết có các mốc năm 19xx hoặc 20xx',
      },
      witnesses: {
        type: 'ARRAY',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Tên nhân chứng hoặc Ẩn danh' },
            testimony: {
              type: 'STRING',
              description: 'Lời kể chi tiết 100-150 từ, giàu cảm xúc và ám ảnh',
            },
            date: { type: 'STRING', description: 'Ngày ghi nhận hồ sơ' },
          },
          required: ['name', 'testimony', 'date'],
        },
      },
      spectral_analysis: {
        type: 'STRING',
        description: 'Phân tích kỹ thuật chuyên sâu bằng tiếng Việt',
      },
      risk_assessment: {
        type: 'STRING',
        description: 'Quy tắc an toàn và đánh giá độ rủi ro bằng tiếng Việt',
      },
      image_prompt: {
        type: 'STRING',
        description: 'Prompt tiếng Anh chi tiết để tạo ảnh found-footage horror theo tỷ lệ 16:9',
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
        name: typeof w.name === 'string' ? w.name : 'Nhân chứng Ẩn danh',
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

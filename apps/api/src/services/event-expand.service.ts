import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '../db/prisma';
import { callGemini } from './gemini.service';
import { isAiDailyQuotaExceededError } from './quota.service';

type LevelOneDetail = {
  story_text: string;
  witness: string;
  analysis: string;
};

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('Gemini response did not contain a JSON object');
  }

  return fenced.slice(start, end + 1);
}

function countWords(input: string): number {
  return input
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
}

function buildFallbackStoryText(eventTitle: string, teaser: string, rawText: string): LevelOneDetail {
  const safeSummary = rawText.trim() || teaser || `Dossier generated for ${eventTitle}.`;
  const safeWitness = teaser || `Witness details were not returned in structured form for ${eventTitle}.`;
  const safeAnalysis = `Structured AI fields were unavailable, so the raw provider response was preserved for manual review.`;

  return {
    story_text: `Summary\n${safeSummary}\n\nWitness\n${safeWitness}\n\nAnalysis\n${safeAnalysis}`,
    witness: safeWitness,
    analysis: safeAnalysis,
  };
}

async function generateLevelOneDetail(
  eventTitle: string,
  teaser: string,
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
  const prompt = `
You are generating a Level 1 intelligence dossier for a mystery incident.
Rules:
- 400 to 600 words total.
- Output STRICT JSON object only.
- Keys: summary, witness, analysis.
- Tone: confidential dossier, investigative.
- No markdown formatting.
- Do not present supernatural claims as fact.

Event title: ${eventTitle}
Event teaser: ${teaser}
`.trim();

  const result = await callGemini({
    endpoint: 'expand',
    prompt,
    responseMimeType: 'application/json',
    temperature: 0.3,
    aiCallsThisRequest: 1,
    beforeAttempt: async () => {
      await beforeAiCall?.();
    },
  });

  let parsed:
    | {
        summary?: unknown;
        witness?: unknown;
        analysis?: unknown;
      }
    | null = null;

  try {
    parsed = JSON.parse(extractJsonObject(result.text)) as {
      summary?: unknown;
      witness?: unknown;
      analysis?: unknown;
    };
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

  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
      ? parsed.summary.trim()
      : result.text.trim() || teaser || `Dossier generated for ${eventTitle}.`;
  const witness =
    typeof parsed.witness === 'string' && parsed.witness.trim().length > 0
      ? parsed.witness.trim()
      : teaser || `Witness details were not returned in structured form for ${eventTitle}.`;
  const analysis =
    typeof parsed.analysis === 'string' && parsed.analysis.trim().length > 0
      ? parsed.analysis.trim()
      : 'Analysis section was missing from the structured provider response.';

  if (
    (typeof parsed.summary !== 'string' || !parsed.summary.trim()) ||
    (typeof parsed.witness !== 'string' || !parsed.witness.trim()) ||
    (typeof parsed.analysis !== 'string' || !parsed.analysis.trim())
  ) {
    logger?.warn(
      { requestId },
      'expand.content.fields_missing'
    );
  }

  const storyText = `Summary\n${summary}\n\nWitness\n${witness}\n\nAnalysis\n${analysis}`;
  const wordCount = countWords(storyText);
  if (wordCount < 400 || wordCount > 600) {
    logger?.warn(
      { requestId, wordCount },
      'expand.wordcount.out_of_range'
    );
  }

  return {
    story_text: storyText,
    witness,
    analysis,
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
    return { notFound: true as const };
  }

  const existing = await prisma.event_details.findFirst({
    where: {
      event_id: eventId,
      level: 1,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  if (existing) {
    console.log('expand_cache_hit event_id=%s ai_calls_this_expand=0', eventId);
    return { notFound: false as const, detail: existing, aiCallsThisExpand: 0, cacheStatus: 'HIT' as const };
  }

  const eventData = (event.event_data ?? {}) as Record<string, unknown>;
  const title = typeof eventData.title === 'string' ? eventData.title : 'Unknown event';
  const teaser = typeof eventData.teaser === 'string' ? eventData.teaser : '';

  let aiCallsThisExpand = 0;
  let detail: LevelOneDetail | null = null;
  console.log('expand_cache_miss event_id=%s', eventId);
  try {
    aiCallsThisExpand = 1;
    detail = await generateLevelOneDetail(title, teaser, logger, requestId, beforeAiCall);
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
      story_text: detail.story_text,
      witness: detail.witness,
      analysis: detail.analysis,
      generated_at: new Date(),
      detail: {
        level: 1,
        story_text: detail.story_text,
        witness: detail.witness,
        analysis: detail.analysis,
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

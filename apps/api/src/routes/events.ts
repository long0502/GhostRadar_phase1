import * as fs from 'fs/promises';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { expandEventLevelOne, getEventWithLevelOneDetail } from '../services/event-expand.service';
import { AiDailyQuotaExceededError, reserveAiQuotaForRequest } from '../services/quota.service';
import { logUsage } from '../services/logging.service';
import { prisma } from '../db/prisma';
import {
  getEventImageMimeType,
  getEventImagePath,
  isLocalEventImageUrl,
  localizeExistingEventImage,
  persistGeneratedEventImage,
} from '../services/event-image.service';

function parseLevel(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return Number.NaN;
}

function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length <= 10) {
    return false;
  }

  return !trimmed.toLowerCase().includes('chatgpt.com/backend-api/');
}

function buildImagePrompt(basePrompt: string): string {
  return basePrompt.trim();
}

const IMAGE_PROCESSING_STALE_AFTER_MS = 12 * 60 * 1000;

function parseIsoDateMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function appendImagePromptDebugLog(eventId: string, prompt: string): void {
  try {
    const nodeFs = require('fs') as typeof import('fs');
    const logLine = `\n[IMAGE_PROMPT] ${new Date().toISOString()} event_id=${eventId}\n${prompt}\n---\n`;
    nodeFs.appendFileSync('raw_ai.log', logLine);
    nodeFs.appendFileSync('gemini_debug.log', logLine);
    console.log(`[IMAGE_PROMPT] event_id=${eventId} prompt_logged=true`);
  } catch (_) {}
}

export default async function eventsRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/images/:fileName', async (request, reply) => {
    const { fileName } = request.params as { fileName: string };
    const normalizedFileName = decodeURIComponent(fileName);
    const absolutePath = getEventImagePath(normalizedFileName);

    try {
      const fileBuffer = await fs.readFile(absolutePath);
      return reply.type(getEventImageMimeType(normalizedFileName)).send(fileBuffer);
    } catch (_) {
      throw app.httpErrors.notFound('Image not found');
    }
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = await getEventWithLevelOneDetail(id);
    if (!payload) {
      throw app.httpErrors.notFound('Event not found');
    }

    return payload;
  });

  app.post('/:id/expand', async (request, reply) => {
    const startTime = Date.now();
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, unknown>;
    const level = parseLevel(query.level);

    if (level !== 1) {
      throw app.httpErrors.badRequest('Only level=1 is supported');
    }

    const lang = (query.lang as string) || 'en';

    request.log.info({ eventId: id, lang, requestId: request.id }, 'expand.request.start');

    try {
      const result = await expandEventLevelOne(
        id,
        lang,
        request.log,
        request.id,
        async () => {
          const reservation = await reserveAiQuotaForRequest(request, 'expand');
          if (!reservation.ok) {
            // throw new AiDailyQuotaExceededError(reservation.scope, reservation.daily_limit, reservation.usage_date);
          }
          return {
            usageDate: reservation.usage_date,
            clientIp: reservation.client_ip,
          };
        }
      );

      if (result.notFound) {
        request.log.warn({ eventId: id, requestId: request.id }, 'expand.request.not_found');
        throw app.httpErrors.notFound('Event not found');
      }
      if ((result as { aiFailure?: boolean }).aiFailure) {
        request.log.error({ requestId: request.id, eventId: id }, 'expand.provider.failure');
        const error = app.httpErrors.badGateway('Failed to generate Level 1 detail');
        (error as { code?: string }).code = 'AI_ERROR';
        throw error;
      }

      // Fire-and-forget usage log
      logUsage({
        action: 'expand',
        eventId: id,
        lang,
        ip: request.ip,
        cacheHit: result.cacheStatus === 'HIT',
        aiCalled: result.cacheStatus === 'MISS',
        eventsReturned: 0,
        responseMs: Date.now() - startTime,
      });

      return result.detail;
    } catch (error) {
      logUsage({
        action: 'expand',
        eventId: id,
        lang,
        ip: request.ip,
        cacheHit: false,
        aiCalled: false,
        eventsReturned: 0,
        responseMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  // Async image generation — called AFTER expand, text is already displayed
  app.post('/:id/generate-image', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Find the event detail with image_prompt
    const detail = await prisma.event_details.findFirst({
      where: { event_id: id, level: 1 },
      orderBy: { created_at: 'desc' },
    });

    if (!detail) {
      throw app.httpErrors.notFound('Event detail not found');
    }

    const detailJson = (detail.detail ?? {}) as Record<string, unknown>;
    const imagePrompt = typeof detailJson.image_prompt === 'string' ? detailJson.image_prompt : '';
    const cachedImageUrl = typeof detailJson.image_url === 'string' ? detailJson.image_url.trim() : '';
    const generationStatus =
      typeof detailJson.image_generation_status === 'string'
        ? detailJson.image_generation_status.trim().toLowerCase()
        : '';
    const generationStartedAt = parseIsoDateMs(detailJson.image_generation_started_at);
    const imageCacheUsable = isUsableImageUrl(cachedImageUrl);

    // If image already generated, return it
    if (imageCacheUsable) {
      if (isLocalEventImageUrl(cachedImageUrl)) {
        return { image_url: cachedImageUrl, cached: true };
      }

      const localizedImage = await localizeExistingEventImage(detail.id, cachedImageUrl);
      const localizedDetail = { ...detailJson, image_url: localizedImage.publicUrl };
      await prisma.event_details.update({
        where: { id: detail.id },
        data: { detail: localizedDetail },
      });

      return { image_url: localizedImage.publicUrl, cached: true };
    }

    const processingIsStale =
      generationStatus === 'processing' &&
      (generationStartedAt === null || Date.now() - generationStartedAt > IMAGE_PROCESSING_STALE_AFTER_MS);

    if (generationStatus === 'processing' && !processingIsStale) {
      request.log.info(
        {
          eventId: id,
          requestId: request.id,
          generationStartedAt: detailJson.image_generation_started_at ?? null,
        },
        'generate_image.pending_existing_job'
      );
      return { image_url: '', pending: true, cached: false };
    }

    if (processingIsStale) {
      request.log.warn(
        {
          eventId: id,
          requestId: request.id,
          generationStartedAt: detailJson.image_generation_started_at ?? null,
          staleAfterMs: IMAGE_PROCESSING_STALE_AFTER_MS,
        },
        'generate_image.stale_processing_requeued'
      );
    }

    if (!imagePrompt || imagePrompt.length < 5) {
      await prisma.event_details.update({
        where: { id: detail.id },
        data: {
          detail: {
            ...detailJson,
            image_url: '',
            image_generation_status: 'failed',
            image_generation_error: 'No image prompt available',
          },
        },
      });
      return { image_url: '', error: 'No image prompt available' };
    }

    // Mark as processing first so client can poll instead of waiting for long gateway jobs.
    const finalImagePrompt = buildImagePrompt(imagePrompt);
    await prisma.event_details.update({
      where: { id: detail.id },
      data: {
        detail: {
          ...detailJson,
          image_url: '',
          image_generation_status: 'processing',
          image_generation_error: null,
          image_generation_started_at: new Date().toISOString(),
        },
      },
    });

    appendImagePromptDebugLog(id, finalImagePrompt);
    void (async () => {
      const { callGeminiImageQueued } = await import('../services/gemini.service');
      try {
        const imageResult = await callGeminiImageQueued(finalImagePrompt);
        if (!imageResult) {
          await prisma.event_details.update({
            where: { id: detail.id },
            data: {
              detail: {
                ...detailJson,
                image_url: '',
                image_generation_status: 'failed',
                image_generation_error: 'gateway returned an invalid image result',
              },
            },
          });
          request.log.warn({ eventId: id, requestId: request.id }, 'generate_image.invalid_gateway_result');
          return;
        }

        const localizedImage = await persistGeneratedEventImage(detail.id, imageResult);
        const updatedDetail = {
          ...detailJson,
          image_url: localizedImage.publicUrl,
          image_generation_status: 'ready',
          image_generation_error: null,
          image_generation_completed_at: new Date().toISOString(),
        };
        await prisma.event_details.update({
          where: { id: detail.id },
          data: { detail: updatedDetail },
        });

        console.log(`[GENERATE_IMAGE] Image saved locally for event_id=${id}, file=${localizedImage.fileName}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await prisma.event_details.update({
          where: { id: detail.id },
          data: {
            detail: {
              ...detailJson,
              image_url: '',
              image_generation_status: 'failed',
              image_generation_error: message,
            },
          },
        });
        request.log.error({ eventId: id, requestId: request.id, message }, 'generate_image.failed');
      }
    })();

    return { image_url: '', pending: true, cached: false };
  });
}

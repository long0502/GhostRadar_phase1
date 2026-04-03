import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { expandEventLevelOne, getEventWithLevelOneDetail } from '../services/event-expand.service';
import { AiDailyQuotaExceededError, reserveAiQuotaForRequest } from '../services/quota.service';
import { logUsage } from '../services/logging.service';
import { prisma } from '../db/prisma';

function parseLevel(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return Number.NaN;
}

export default async function eventsRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
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

    // If image already generated, return it
    if (typeof detailJson.image_url === 'string' && detailJson.image_url.length > 10) {
      return { image_url: detailJson.image_url, cached: true };
    }

    if (!imagePrompt || imagePrompt.length < 5) {
      return { image_url: '', error: 'No image prompt available' };
    }

    // Generate the image
    const { callGeminiImageQueued } = await import('../services/gemini.service');
    const imageResult = await callGeminiImageQueued(imagePrompt);

    if (!imageResult) {
      return { image_url: '', error: 'Image generation failed' };
    }

    // Update the detail JSON with the image URL
    const updatedDetail = { ...detailJson, image_url: imageResult.dataUrl };
    await prisma.event_details.update({
      where: { id: detail.id },
      data: { detail: updatedDetail },
    });

    console.log(`[GENERATE_IMAGE] Image saved for event_id=${id}, size=${imageResult.imageBase64.length}`);
    return { image_url: imageResult.dataUrl, cached: false };
  });
}

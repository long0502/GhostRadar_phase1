import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { scanService } from '../services/scan.service';
import { AiDailyQuotaExceededError, reserveAiQuotaForRequest } from '../services/quota.service';
import { logUsage } from '../services/logging.service';

const scanInputSchema = z.object({
  lat: z.coerce.number().min(-90, 'lat must be between -90 and 90').max(90, 'lat must be between -90 and 90'),
  lon: z.coerce
    .number()
    .min(-180, 'lon must be between -180 and 180')
    .max(180, 'lon must be between -180 and 180'),
  radiusKm: z.coerce
    .number()
    .min(0.5, 'radiusKm must be between 0.5 and 20')
    .max(20, 'radiusKm must be between 0.5 and 20'),
  lang: z.string().optional().default('en'),
  force: z.coerce.boolean().optional().default(false),
});

export default async function scanRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.post('/', async (request, reply) => {
    const startTime = Date.now();
    const requestId = request.id;
    const query = (request.query ?? {}) as Record<string, unknown>;
    const body =
      request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    const hasQueryInput = ['lat', 'lon', 'radiusKm', 'force'].some((key) => query[key] !== undefined);
    const source = hasQueryInput ? 'query' : 'body';
    const rawInput = hasQueryInput ? query : body;

    request.log.info({ requestId, source, payloadKeys: Object.keys(rawInput) }, 'scan.validation.start');

    const parsed = scanInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      request.log.warn(
        {
          requestId,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
        'scan.validation.failed'
      );
      throw parsed.error;
    }

    const { lat, lon, radiusKm, lang, force } = parsed.data;
    request.log.info({ requestId, lat, lon, radiusKm, lang, force }, 'scan.validation.ok');

    try {
      const result = await scanService({
        lat,
        lon,
        radiusKm,
        lang,
        force,
        logger: request.log,
        requestId,
        beforeAiCall: async () => {
          request.log.info({ requestId }, 'scan.quota.start');
          const reservation = await reserveAiQuotaForRequest(request, 'scan');
          if (!reservation.ok) {
            request.log.warn(
              {
                requestId,
                scope: reservation.scope,
                daily_limit: reservation.daily_limit,
                usage_date: reservation.usage_date,
              },
              'scan.quota.blocked'
            );
            throw new AiDailyQuotaExceededError(reservation.scope, reservation.daily_limit, reservation.usage_date);
          }
          request.log.info(
            {
              requestId,
              usageDate: reservation.usage_date,
              clientIp: reservation.client_ip,
            },
            'scan.quota.ok'
          );
          return {
            usageDate: reservation.usage_date,
            clientIp: reservation.client_ip,
          };
        },
      });

      const responseMs = Date.now() - startTime;
      request.log.info({ requestId, cacheStatus: result.cacheStatus }, 'scan.completed');
      console.log(`[API] SCAN COMPLETED. GridID: ${result.response.grid_id}, CacheStatus: ${result.cacheStatus}`);

      // Fire-and-forget usage log
      logUsage({
        action: 'scan',
        lat, lon, radiusKm, lang,
        gridId: result.response.grid_id,
        ip: request.ip,
        cacheHit: result.cacheStatus === 'HIT',
        aiCalled: result.cacheStatus === 'MISS',
        eventsReturned: Array.isArray(result.response.events) ? result.response.events.length : 0,
        responseMs,
      });

      reply.header('X-Cache', result.cacheStatus);
      reply.header('x-cache', result.cacheStatus);
      return result.response;
    } catch (error) {
      const responseMs = Date.now() - startTime;
      logUsage({
        action: 'scan',
        lat, lon, radiusKm, lang,
        ip: request.ip,
        cacheHit: false,
        aiCalled: false,
        eventsReturned: 0,
        responseMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

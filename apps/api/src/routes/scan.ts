import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { scanService } from '../services/scan.service';
import { AiDailyQuotaExceededError, reserveAiQuotaForRequest } from '../services/quota.service';

const scanInputSchema = z.object({
  lat: z.coerce.number().min(-90, 'lat must be between -90 and 90').max(90, 'lat must be between -90 and 90'),
  lon: z.coerce
    .number()
    .min(-180, 'lon must be between -180 and 180')
    .max(180, 'lon must be between -180 and 180'),
  radiusKm: z.coerce
    .number()
    .min(0.5, 'radiusKm must be between 0.5 and 10')
    .max(10, 'radiusKm must be between 0.5 and 10'),
});

export default async function scanRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.post('/', async (request, reply) => {
    const requestId = request.id;
    const query = (request.query ?? {}) as Record<string, unknown>;
    const body =
      request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    const hasQueryInput = ['lat', 'lon', 'radiusKm'].some((key) => query[key] !== undefined);
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

    const { lat, lon, radiusKm } = parsed.data;
    request.log.info({ requestId, lat, lon, radiusKm }, 'scan.validation.ok');

    const result = await scanService({
      lat,
      lon,
      radiusKm,
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
    request.log.info({ requestId, cacheStatus: result.cacheStatus }, 'scan.completed');
    reply.header('X-Cache', result.cacheStatus);
    return result.response;
  });
}

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { scanService } from '../services/scan.service';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return Number.NaN;
}

export default async function scanRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.post('/', async (request, reply) => {
    const query = request.query as Record<string, unknown>;

    const lat = toNumber(query.lat);
    const lon = toNumber(query.lon);
    const radiusKm = toNumber(query.radiusKm);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusKm)) {
      throw app.httpErrors.badRequest('lat, lon, radiusKm must be valid numbers');
    }

    const result = await scanService({ lat, lon, radiusKm });
    reply.header('X-Cache', result.cacheStatus);
    return result.response;
  });
}

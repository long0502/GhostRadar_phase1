import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../db';
import { z } from 'zod';

export default async function gridCacheRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/', async (request) => {
    const schema = z.object({ grid_id: z.string() });
    const params = schema.parse(request.query);
    const cache = await prisma.grid_cache.findUnique({ where: { grid_id: params.grid_id } });
    if (!cache) throw app.httpErrors.notFound('Not found');
    return cache;
  });
}

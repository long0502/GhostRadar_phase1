import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../db';

export default async function readyRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/', async () => {
    const timeoutMs = 800;
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        setTimeout(() => reject(app.httpErrors.serviceUnavailable('Database not ready')), timeoutMs);
      }),
    ]);
    return { status: 'ready' };
  });
}

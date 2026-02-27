import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { globalStats } from '../core/metrics';

export default async function metricsRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/', async () => {
    return globalStats;
  });
}

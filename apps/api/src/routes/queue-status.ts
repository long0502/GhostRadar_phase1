import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getQueueStatus } from '../services/ai-queue.service';

export default async function queueStatusRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/', async (request, reply) => {
    return getQueueStatus();
  });
}

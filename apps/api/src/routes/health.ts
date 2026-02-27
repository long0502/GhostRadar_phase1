import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export async function healthRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/', async () => {
    return { status: 'ok' };
  });
}

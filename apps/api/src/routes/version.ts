import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export default async function versionRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/', async () => {
    return { version: process.env.BUILD_VERSION || 'dev' };
  });
}

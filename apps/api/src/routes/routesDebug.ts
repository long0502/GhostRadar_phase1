import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export default async function routesDebug(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/', async (_request, reply) => {
    reply.type('text/plain').send(app.printRoutes());
  });
}

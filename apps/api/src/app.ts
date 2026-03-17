import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';

import { healthRoutes } from './routes/health';
import readyRoutes from './routes/ready';
import routesDebug from './routes/routesDebug';
import versionRoutes from './routes/version';

export async function createApp() {
  const app = Fastify({
    logger: true,
    disableRequestLogging: true,
  });
  const isDevelopment = process.env.NODE_ENV !== 'production';

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-Cache', 'X-Queue-Position', 'X-Queue-Wait'],
  });
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    allowList: isDevelopment ? ['127.0.0.1', '::1'] : undefined,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    enableDraftSpec: true,
  });
  await app.register(sensible);

  app.addHook('onRequest', async (request) => {
    (request as any).__startTimeMs = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = (request as any).__startTimeMs as number | undefined;
    const responseTimeMs = start ? Date.now() - start : 0;

    app.log.info({
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs,
    });
  });

  app.register(healthRoutes, { prefix: '/health' });
  app.register(routesDebug, { prefix: '/__routes' });
  app.register(versionRoutes, { prefix: '/version' });
  app.register(readyRoutes, { prefix: '/ready' });

  return app;
}

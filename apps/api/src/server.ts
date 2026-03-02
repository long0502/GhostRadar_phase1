import { createApp } from './app.js';
import { config } from 'dotenv';
import gridCacheRoutes from './routes/gridCache.js';
import scanRoutes from './routes/scan.js';
import eventsRoutes from './routes/events.js';
import aiHealthRoutes from './routes/aiHealth.js';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { getGeminiModel } from './utils/env.js';
import { cleanupAiUsageDailyRetention, isAiDailyQuotaExceededError } from './services/quota.service.js';

config();
const geminiModel = getGeminiModel();
console.log(`Environment loaded: GEMINI_MODEL=${geminiModel}`);

const port = process.env.PORT ? Number(process.env.PORT) : 8088;

async function start() {
  const app = await createApp();

  app.setNotFoundHandler(async () => {
    throw app.httpErrors.notFound('Route not found');
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        err: error,
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'unhandled_error'
    );

    const err = error as {
      code?: string;
      statusCode?: number;
      message?: string;
      validation?: unknown;
    };

    const isValidationError =
      error instanceof ZodError || Boolean(err.validation) || err.code === 'FST_ERR_VALIDATION';
    const isAiError = err.code === 'AI_ERROR';
    const isQuotaExceeded = isAiDailyQuotaExceededError(error);
    const isNotFoundError = err.statusCode === 404;
    const prismaConnectionError =
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientRustPanicError ||
      /database|connect|econnrefused|timeout|prisma/i.test(err.message ?? '');

    const statusCode = isValidationError
      ? 400
      : isAiError
      ? 502
      : isQuotaExceeded
      ? 429
      : isNotFoundError
      ? 404
      : prismaConnectionError
      ? 500
      : err.statusCode && Number.isInteger(err.statusCode)
      ? err.statusCode
      : 500;

    const code =
      isValidationError
        ? 'VALIDATION_ERROR'
        : isAiError
        ? 'AI_ERROR'
        : isQuotaExceeded
        ? 'AI_DAILY_QUOTA_EXCEEDED'
        : isNotFoundError
        ? 'NOT_FOUND'
        : 'INTERNAL_ERROR';

    if (isQuotaExceeded) {
      reply.status(429).send({
        error: 'AI_DAILY_QUOTA_EXCEEDED',
        scope: error.scope,
        daily_limit: error.daily_limit,
        usage_date: error.usage_date,
      });
      return;
    }

    const message =
      isValidationError
        ? err.message ?? 'Validation failed'
        : isNotFoundError
        ? err.message ?? 'Resource not found'
        : isAiError
        ? 'AI request failed'
        : 'Internal server error';

    reply.status(statusCode).send({
      error: {
        code,
        message,
      },
    });
  });

  app.register(gridCacheRoutes, { prefix: '/grid-cache' });
  app.register(scanRoutes, { prefix: '/scan' });
  app.register(eventsRoutes, { prefix: '/events' });
  app.register(aiHealthRoutes, { prefix: '/internal' });
  console.log('Metrics endpoint registered');
  app.log.info('\n' + app.printRoutes());
  try {
    const deletedCount = await cleanupAiUsageDailyRetention();
    console.log('ai_usage_cleanup_ok deleted_count=%d retention_days=180', deletedCount);
  } catch (error) {
    app.log.warn({ err: error }, 'ai_usage_cleanup_fail');
  }
  app.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  });
}

start();

import * as fs from 'fs';
import * as path from 'path';
import { createApp } from './app';
import { config } from 'dotenv';
import gridCacheRoutes from './routes/gridCache';
import scanRoutes from './routes/scan';
import eventsRoutes from './routes/events';
import aiHealthRoutes from './routes/aiHealth';
import queueStatusRoutes from './routes/queue-status';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { getGeminiModel, getPort } from './utils/env';
import {
  cleanupAiUsageDailyRetention,
  ensureAiQuotaPolicyDefaults,
  isAiDailyQuotaExceededError,
} from './services/quota.service.js';

// Ensure cwd is always the api root (apps/api) so relative paths work
const apiRoot = path.resolve(__dirname, '..');
process.chdir(apiRoot);

config();
const geminiModel = getGeminiModel();
console.log(`Environment loaded: GEMINI_MODEL=${geminiModel}, CWD=${process.cwd()}`);

const port = getPort();

async function start() {
  const app = await createApp();

  app.setNotFoundHandler(async () => {
    throw app.httpErrors.notFound('Route not found');
  });

  app.setErrorHandler((error, request, reply) => {
    try { fs.appendFileSync('server_debug.log', `[API_ERROR] ${new Date().toISOString()} ${JSON.stringify(error, null, 2)}\n`); } catch (_) {}
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
      status?: number;
      message?: string;
      validation?: unknown;
    };

    const isValidationError =
      error instanceof ZodError || Boolean(err.validation) || err.code === 'FST_ERR_VALIDATION';
    const isBadRequestError = isValidationError || err.statusCode === 400 || err.status === 400;
    const isAiError = err.code === 'AI_ERROR';
    const isQuotaExceeded = isAiDailyQuotaExceededError(error);
    const isNotFoundError = err.statusCode === 404;
    const prismaConnectionError =
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientRustPanicError ||
      /econnrefused|prisma\s*client|connection\s*pool|prepared\s*statement/i.test(err.message ?? '');

    const statusCode = isBadRequestError
      ? 400
      : isAiError
      ? 502
      : isQuotaExceeded
      ? 429
      : isNotFoundError
      ? 404
      : prismaConnectionError
      ? 503
      : err.statusCode && Number.isInteger(err.statusCode)
      ? err.statusCode
      : 500;

    const code =
      isBadRequestError
        ? 'BAD_REQUEST'
        : isAiError
        ? 'AI_ERROR'
        : isQuotaExceeded
        ? 'AI_DAILY_QUOTA_EXCEEDED'
        : isNotFoundError
        ? 'NOT_FOUND'
        : prismaConnectionError
        ? 'DB_NOT_READY'
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
      isBadRequestError
        ? err.message ?? 'Validation failed'
        : isNotFoundError
        ? err.message ?? 'Resource not found'
        : isAiError
        ? 'AI request failed'
        : prismaConnectionError
        ? 'Database not ready'
        : err.message ?? 'Internal server error';

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
  app.register(queueStatusRoutes, { prefix: '/queue-status' });
  console.log('Metrics endpoint registered');
  app.log.info('\n' + app.printRoutes());
  try {
    await ensureAiQuotaPolicyDefaults();
    console.log('ai_quota_policy_defaults_ok');
    const deletedCount = await cleanupAiUsageDailyRetention();
    console.log('ai_usage_cleanup_ok deleted_count=%d retention_days=180', deletedCount);
  } catch (error) {
    app.log.warn({ err: error }, 'startup_db_maintenance_fail');
  }

  try {
    const address = await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`API listening on ${address}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();

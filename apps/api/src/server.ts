import { createApp } from './app.js';
import { config } from 'dotenv';
import gridCacheRoutes from './routes/gridCache.js';
import scanRoutes from './routes/scan.js';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

config();

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
    const prismaConnectionError =
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientRustPanicError ||
      /database|connect|econnrefused|timeout|prisma/i.test(err.message ?? '');

    const statusCode = isValidationError
      ? 400
      : prismaConnectionError
      ? 503
      : err.statusCode && Number.isInteger(err.statusCode)
      ? err.statusCode
      : 500;

    const code =
      statusCode === 400
        ? 'BAD_REQUEST'
        : statusCode === 404
        ? 'NOT_FOUND'
        : statusCode === 503
        ? 'DB_NOT_READY'
        : 'INTERNAL_ERROR';

    const message =
      statusCode === 500
        ? 'Internal server error'
        : statusCode === 503
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
  app.log.info('\n' + app.printRoutes());
  app.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  });
}

start();

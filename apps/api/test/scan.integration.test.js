const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { ZodError } = require('zod');
const { createApp } = require('../dist/app.js');
const scanRoutes = require('../dist/routes/scan.js').default;
const { prisma } = require('../dist/db/prisma.js');

const SCAN_QUERY = '/scan?lat=10.776&lon=106.700&radiusKm=5';
const eventDelegate = prisma.event ?? prisma.events;
const gridCacheDelegate = prisma.gridCache ?? prisma.grid_cache;

async function buildTestApp() {
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

    const err = error;
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

  app.register(scanRoutes, { prefix: '/scan' });
  await app.ready();
  return app;
}

test.beforeEach(async () => {
  assert.ok(eventDelegate, 'Event delegate not found on Prisma client');
  assert.ok(gridCacheDelegate, 'Grid cache delegate not found on Prisma client');
  await eventDelegate.deleteMany({});
  await gridCacheDelegate.deleteMany({});
});

test.after(async () => {
  await prisma.$disconnect();
});

test('Test 1: POST /scan returns 200 and events_json', async () => {
  const app = await buildTestApp();
  const res = await app.inject({ method: 'POST', url: SCAN_QUERY });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.grid_id);
  assert.ok(Array.isArray(body.events_json));
  assert.ok(body.events_json.length > 0);

  await app.close();
});

test('Test 2: GET /scan should not be allowed (404 or 405)', async () => {
  const app = await buildTestApp();
  const res = await app.inject({ method: 'GET', url: SCAN_QUERY });
  assert.ok([404, 405].includes(res.statusCode));
  await app.close();
});

test('Test 3: POST /scan twice returns same event IDs and no new insert', async () => {
  const app = await buildTestApp();

  const res1 = await app.inject({ method: 'POST', url: SCAN_QUERY });
  assert.equal(res1.statusCode, 200);
  const body1 = res1.json();
  const ids1 = body1.events_json.map((e) => e.id).sort();

  const countAfter1 = await eventDelegate.count({});

  const res2 = await app.inject({ method: 'POST', url: SCAN_QUERY });
  assert.equal(res2.statusCode, 200);
  const body2 = res2.json();
  const ids2 = body2.events_json.map((e) => e.id).sort();

  const countAfter2 = await eventDelegate.count({});

  assert.deepEqual(ids2, ids1);
  assert.equal(countAfter2, countAfter1);

  await app.close();
});

test('Test 4: Missing radiusKm returns 400 BAD_REQUEST', async () => {
  const app = await buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/scan?lat=10.776&lon=106.700',
  });

  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body?.error?.code, 'BAD_REQUEST');

  await app.close();
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/app.js');
const scanRoutes = require('../dist/routes/scan.js').default;

async function buildTestApp() {
  const app = await createApp();

  app.setNotFoundHandler(async () => {
    throw app.httpErrors.notFound('Route not found');
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error;
    reply.status(err.statusCode || 500).send({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Internal server error',
        details: err.details,
      },
    });
  });

  app.register(scanRoutes, { prefix: '/scan' });
  await app.ready();
  return app;
}

test('Phase 6: /scan rate limiting returns 429 on third request', async () => {
  process.env.SCAN_RATE_LIMIT_MAX = '2';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';

  const app = await buildTestApp();
  const url = '/scan?lat=91&lon=106.700&radiusKm=1';
  const headers = { 'x-client-id': '11111111-1111-4111-8111-111111111111' };
  const remoteAddress = '203.0.113.10';

  const res1 = await app.inject({ method: 'POST', url, headers, remoteAddress });
  const res2 = await app.inject({ method: 'POST', url, headers, remoteAddress });
  const res3 = await app.inject({ method: 'POST', url, headers, remoteAddress });

  assert.equal(res1.statusCode, 400);
  assert.equal(res2.statusCode, 400);
  assert.equal(res3.statusCode, 429);
  assert.equal(res3.json().error.code, 'RATE_LIMITED');

  await app.close();
});

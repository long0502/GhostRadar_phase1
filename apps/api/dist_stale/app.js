"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const sensible_1 = __importDefault(require("@fastify/sensible"));
const health_1 = require("./routes/health");
const ready_1 = __importDefault(require("./routes/ready"));
const routesDebug_1 = __importDefault(require("./routes/routesDebug"));
const version_1 = __importDefault(require("./routes/version"));
async function createApp() {
    const app = (0, fastify_1.default)({
        logger: true,
        disableRequestLogging: true,
    });
    const isDevelopment = process.env.NODE_ENV !== 'production';
    await app.register(cors_1.default);
    await app.register(rate_limit_1.default, {
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
    await app.register(sensible_1.default);
    app.addHook('onRequest', async (request) => {
        request.__startTimeMs = Date.now();
    });
    app.addHook('onResponse', async (request, reply) => {
        const start = request.__startTimeMs;
        const responseTimeMs = start ? Date.now() - start : 0;
        app.log.info({
            requestId: request.id,
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTimeMs,
        });
    });
    app.register(health_1.healthRoutes, { prefix: '/health' });
    app.register(routesDebug_1.default, { prefix: '/__routes' });
    app.register(version_1.default, { prefix: '/version' });
    app.register(ready_1.default, { prefix: '/ready' });
    return app;
}

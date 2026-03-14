"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("./app.js");
const dotenv_1 = require("dotenv");
const gridCache_js_1 = __importDefault(require("./routes/gridCache.js"));
const scan_js_1 = __importDefault(require("./routes/scan.js"));
const events_js_1 = __importDefault(require("./routes/events.js"));
const aiHealth_js_1 = __importDefault(require("./routes/aiHealth.js"));
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const env_js_1 = require("./utils/env.js");
const quota_service_js_1 = require("./services/quota.service.js");
(0, dotenv_1.config)();
const geminiModel = (0, env_js_1.getGeminiModel)();
console.log(`Environment loaded: GEMINI_MODEL=${geminiModel}`);
const port = (0, env_js_1.getPort)();
async function start() {
    const app = await (0, app_js_1.createApp)();
    app.setNotFoundHandler(async () => {
        throw app.httpErrors.notFound('Route not found');
    });
    app.setErrorHandler((error, request, reply) => {
        request.log.error({
            err: error,
            requestId: request.id,
            method: request.method,
            url: request.url,
        }, 'unhandled_error');
        const err = error;
        const isValidationError = error instanceof zod_1.ZodError || Boolean(err.validation) || err.code === 'FST_ERR_VALIDATION';
        const isBadRequestError = isValidationError || err.statusCode === 400 || err.status === 400;
        const isAiError = err.code === 'AI_ERROR';
        const isQuotaExceeded = (0, quota_service_js_1.isAiDailyQuotaExceededError)(error);
        const isNotFoundError = err.statusCode === 404;
        const prismaConnectionError = error instanceof client_1.Prisma.PrismaClientInitializationError ||
            error instanceof client_1.Prisma.PrismaClientRustPanicError ||
            /database|connect|econnrefused|timeout|prisma/i.test(err.message ?? '');
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
        const code = isBadRequestError
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
        const message = isBadRequestError
            ? err.message ?? 'Validation failed'
            : isNotFoundError
                ? err.message ?? 'Resource not found'
                : isAiError
                    ? 'AI request failed'
                    : prismaConnectionError
                        ? 'Database not ready'
                        : 'Internal server error';
        reply.status(statusCode).send({
            error: {
                code,
                message,
            },
        });
    });
    app.register(gridCache_js_1.default, { prefix: '/grid-cache' });
    app.register(scan_js_1.default, { prefix: '/scan' });
    app.register(events_js_1.default, { prefix: '/events' });
    app.register(aiHealth_js_1.default, { prefix: '/internal' });
    console.log('Metrics endpoint registered');
    app.log.info('\n' + app.printRoutes());
    try {
        await (0, quota_service_js_1.ensureAiQuotaPolicyDefaults)();
        console.log('ai_quota_policy_defaults_ok');
        const deletedCount = await (0, quota_service_js_1.cleanupAiUsageDailyRetention)();
        console.log('ai_usage_cleanup_ok deleted_count=%d retention_days=180', deletedCount);
    }
    catch (error) {
        app.log.warn({ err: error }, 'startup_db_maintenance_fail');
    }
    try {
        const address = await app.listen({ port, host: '0.0.0.0' });
        app.log.info(`API listening on ${address}`);
    }
    catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}
start();

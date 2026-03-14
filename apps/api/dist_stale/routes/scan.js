"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = scanRoutes;
const zod_1 = require("zod");
const scan_service_1 = require("../services/scan.service");
const quota_service_1 = require("../services/quota.service");
const scanInputSchema = zod_1.z.object({
    lat: zod_1.z.coerce.number().min(-90, 'lat must be between -90 and 90').max(90, 'lat must be between -90 and 90'),
    lon: zod_1.z.coerce
        .number()
        .min(-180, 'lon must be between -180 and 180')
        .max(180, 'lon must be between -180 and 180'),
    radiusKm: zod_1.z.coerce
        .number()
        .min(0.5, 'radiusKm must be between 0.5 and 10')
        .max(10, 'radiusKm must be between 0.5 and 10'),
});
async function scanRoutes(app, opts) {
    app.post('/', async (request, reply) => {
        const requestId = request.id;
        const query = (request.query ?? {});
        const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
            ? request.body
            : {};
        const hasQueryInput = ['lat', 'lon', 'radiusKm'].some((key) => query[key] !== undefined);
        const source = hasQueryInput ? 'query' : 'body';
        const rawInput = hasQueryInput ? query : body;
        request.log.info({ requestId, source, payloadKeys: Object.keys(rawInput) }, 'scan.validation.start');
        const parsed = scanInputSchema.safeParse(rawInput);
        if (!parsed.success) {
            request.log.warn({
                requestId,
                issues: parsed.error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                    code: issue.code,
                })),
            }, 'scan.validation.failed');
            throw parsed.error;
        }
        const { lat, lon, radiusKm } = parsed.data;
        request.log.info({ requestId, lat, lon, radiusKm }, 'scan.validation.ok');
        const result = await (0, scan_service_1.scanService)({
            lat,
            lon,
            radiusKm,
            logger: request.log,
            requestId,
            beforeAiCall: async () => {
                request.log.info({ requestId }, 'scan.quota.start');
                const reservation = await (0, quota_service_1.reserveAiQuotaForRequest)(request, 'scan');
                if (!reservation.ok) {
                    request.log.warn({
                        requestId,
                        scope: reservation.scope,
                        daily_limit: reservation.daily_limit,
                        usage_date: reservation.usage_date,
                    }, 'scan.quota.blocked');
                    throw new quota_service_1.AiDailyQuotaExceededError(reservation.scope, reservation.daily_limit, reservation.usage_date);
                }
                request.log.info({
                    requestId,
                    usageDate: reservation.usage_date,
                    clientIp: reservation.client_ip,
                }, 'scan.quota.ok');
                return {
                    usageDate: reservation.usage_date,
                    clientIp: reservation.client_ip,
                };
            },
        });
        request.log.info({ requestId, cacheStatus: result.cacheStatus }, 'scan.completed');
        reply.header('X-Cache', result.cacheStatus);
        return result.response;
    });
}

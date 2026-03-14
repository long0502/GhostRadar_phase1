"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = eventsRoutes;
const event_expand_service_1 = require("../services/event-expand.service");
const quota_service_1 = require("../services/quota.service");
function parseLevel(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string' && value.trim().length > 0)
        return Number(value);
    return Number.NaN;
}
async function eventsRoutes(app, opts) {
    app.get('/:id', async (request, reply) => {
        const { id } = request.params;
        const payload = await (0, event_expand_service_1.getEventWithLevelOneDetail)(id);
        if (!payload) {
            throw app.httpErrors.notFound('Event not found');
        }
        return payload;
    });
    app.post('/:id/expand', async (request, reply) => {
        const { id } = request.params;
        const query = request.query;
        const level = parseLevel(query.level);
        if (level !== 1) {
            throw app.httpErrors.badRequest('Only level=1 is supported');
        }
        const result = await (0, event_expand_service_1.expandEventLevelOne)(id, request.log, request.id, async () => {
            const reservation = await (0, quota_service_1.reserveAiQuotaForRequest)(request, 'expand');
            if (!reservation.ok) {
                throw new quota_service_1.AiDailyQuotaExceededError(reservation.scope, reservation.daily_limit, reservation.usage_date);
            }
            return {
                usageDate: reservation.usage_date,
                clientIp: reservation.client_ip,
            };
        });
        if (result.notFound) {
            throw app.httpErrors.notFound('Event not found');
        }
        if (result.aiFailure) {
            request.log.error({ requestId: request.id, eventId: id }, 'expand.provider.failure');
            const error = app.httpErrors.badGateway('Failed to generate Level 1 detail');
            error.code = 'AI_ERROR';
            throw error;
        }
        return result.detail;
    });
}

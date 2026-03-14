"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = aiHealthRoutes;
const metrics_1 = require("../core/metrics");
const gemini_service_1 = require("../services/gemini.service");
const quota_service_1 = require("../services/quota.service");
async function aiHealthRoutes(app, opts) {
    app.get('/ai-health', async (request) => {
        try {
            const result = await (0, gemini_service_1.callGemini)({
                endpoint: 'ai-health',
                prompt: 'ping',
                responseMimeType: 'text/plain',
                temperature: 0,
                aiCallsThisRequest: 1,
            });
            const clientIp = (0, quota_service_1.getClientIp)(request);
            const usage = await (0, quota_service_1.getTodayAiUsageSnapshot)(clientIp);
            return {
                status: 'ok',
                model: result.modelVersion,
                totalTokenCount: typeof result.totalTokenCount === 'number' ? result.totalTokenCount : 0,
                usage,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'AI health check failed';
            throw app.httpErrors.serviceUnavailable(message);
        }
    });
    app.get('/metrics', async () => {
        return metrics_1.globalStats;
    });
}

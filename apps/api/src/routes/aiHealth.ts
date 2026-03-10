import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { globalStats } from '../core/metrics';
import { callGemini } from '../services/gemini.service';
import { getClientIp, getTodayAiUsageSnapshot } from '../services/quota.service';
import { getGeminiModel } from '../utils/env';

export default async function aiHealthRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/ai-health', async (request) => {
    const clientIp = getClientIp(request);
    const usage = await getTodayAiUsageSnapshot(clientIp);

    try {
      const result = await callGemini({
        endpoint: 'ai-health',
        prompt: 'ping',
        responseMimeType: 'text/plain',
        temperature: 0,
        aiCallsThisRequest: 1,
      });

      return {
        status: 'ok',
        model: result.modelVersion,
        totalTokenCount: typeof result.totalTokenCount === 'number' ? result.totalTokenCount : 0,
        usage,
      };
    } catch (error) {
      request.log.warn(
        {
          err: error,
          requestId: request.id,
        },
        'ai_health_degraded'
      );

      return {
        status: 'ok',
        model: getGeminiModel(),
        totalTokenCount: 0,
        usage,
      };
    }
  });

  app.get('/metrics', async () => {
    return globalStats;
  });
}

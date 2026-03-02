import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { globalStats } from '../core/metrics';
import { callGemini } from '../services/gemini.service';
import { getClientIp, getTodayAiUsageSnapshot } from '../services/quota.service';

export default async function aiHealthRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/ai-health', async (request) => {
    try {
      const result = await callGemini({
        endpoint: 'ai-health',
        prompt: 'ping',
        responseMimeType: 'text/plain',
        temperature: 0,
        aiCallsThisRequest: 1,
      });
      const clientIp = getClientIp(request);
      const usage = await getTodayAiUsageSnapshot(clientIp);

      return {
        status: 'ok',
        model: result.modelVersion,
        totalTokenCount: typeof result.totalTokenCount === 'number' ? result.totalTokenCount : 0,
        usage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI health check failed';
      throw app.httpErrors.serviceUnavailable(message);
    }
  });

  app.get('/metrics', async () => {
    return globalStats;
  });
}

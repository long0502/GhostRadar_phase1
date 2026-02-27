import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { globalStats } from '../core/metrics';
import { callGemini } from '../services/gemini.service';

export default async function aiHealthRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/ai-health', async () => {
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

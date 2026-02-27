import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { expandEventLevelOne, getEventWithLevelOneDetail } from '../services/event-expand.service';

function parseLevel(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return Number.NaN;
}

export default async function eventsRoutes(app: FastifyInstance, opts: FastifyPluginOptions) {
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = await getEventWithLevelOneDetail(id);
    if (!payload) {
      throw app.httpErrors.notFound('Event not found');
    }

    return payload;
  });

  app.post('/:id/expand', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, unknown>;
    const level = parseLevel(query.level);

    if (level !== 1) {
      throw app.httpErrors.badRequest('Only level=1 is supported');
    }

    const result = await expandEventLevelOne(id);
    if (result.notFound) {
      throw app.httpErrors.notFound('Event not found');
    }
    if ((result as { aiFailure?: boolean }).aiFailure) {
      const error = app.httpErrors.badGateway('Failed to generate Level 1 detail');
      (error as { code?: string }).code = 'AI_ERROR';
      throw error;
    }

    return result.detail;
  });
}

import { prisma } from '../db/prisma';
import type { ScanEvent } from '../domain/event';

type GridCachePayload = {
  events_json: ScanEvent[];
};

export class GridRepository {
  async getCache(gridId: string) {
    return prisma.grid_cache.findUnique({ where: { grid_id: gridId } });
  }

  async upsertCache(gridId: string, expiresAt: Date, payload: GridCachePayload): Promise<void> {
    await prisma.grid_cache.upsert({
      where: { grid_id: gridId },
      update: {
        data: payload,
        expires_at: expiresAt,
      },
      create: {
        grid_id: gridId,
        data: payload,
        expires_at: expiresAt,
      },
    });
  }
}

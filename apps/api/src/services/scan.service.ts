import type { ScanInput, ScanServiceResult } from '../domain/scan';
import { prisma } from '../db/prisma';
import { RssRawSignalProvider } from '../signals/providers/rss.provider';
import { ingestRawSignalBatch } from '../signals/services/rawSignal.service';
import { normalizeAndStoreSignals } from '../signals/services/normalization.service';
import { computeGridId } from '../utils/grid';

const provider = new RssRawSignalProvider();

export async function scanService(input: ScanInput): Promise<ScanServiceResult> {
  const { lat, lon, radiusKm } = input;
  const gridId = computeGridId(lat, lon);
  const rawSignals = await provider.fetch({ lat, lon, radiusKm, gridId });
  await ingestRawSignalBatch(rawSignals);
  await normalizeAndStoreSignals({ gridId, batchSize: 50 });

  const events = await prisma.normalized_signal.findMany({
    where: { grid_id: gridId },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  return {
    cacheStatus: 'MISS',
    response: {
      grid_id: gridId,
      events,
      events_json: events,
    },
  };
}

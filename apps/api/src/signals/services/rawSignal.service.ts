import { prisma } from '../../db/prisma';
import type { RawSignal, RawSignalProvider } from '../providers/types';

type FetchParams = {
  lat: number;
  lon: number;
  radiusKm: number;
  gridId: string;
};

export async function ingestRawSignals(
  provider: RawSignalProvider,
  params: FetchParams
): Promise<number> {
  const rawSignals = await provider.fetch(params);
  return ingestRawSignalBatch(rawSignals);
}

export async function ingestRawSignalBatch(rawSignals: RawSignal[]): Promise<number> {
  if (rawSignals.length === 0) {
    return 0;
  }

  const result = await prisma.raw_signal.createMany({
    data: rawSignals.map((signal) => ({
      source: signal.source,
      fetch_key: signal.fetchKey,
      raw_payload: signal.rawPayload,
    })),
  });

  return result.count;
}

export type PendingRawSignal = {
  id: string;
  source: string;
  fetch_key: string;
  raw_payload: unknown;
  fetched_at: Date;
};

export async function getPendingRawSignalsByGrid(gridId: string, limit: number): Promise<PendingRawSignal[]> {
  return prisma.raw_signal.findMany({
    where: {
      normalized_at: null,
      fetch_key: {
        startsWith: `${gridId}:`,
      },
    },
    orderBy: {
      fetched_at: 'asc',
    },
    take: limit,
    select: {
      id: true,
      source: true,
      fetch_key: true,
      raw_payload: true,
      fetched_at: true,
    },
  });
}

export async function markRawSignalNormalized(rawSignalId: string): Promise<void> {
  await prisma.raw_signal.update({
    where: { id: rawSignalId },
    data: {
      normalized_at: new Date(),
      normalize_error: null,
    },
  });
}

export async function markRawSignalNormalizeError(rawSignalId: string, errorMessage: string): Promise<void> {
  await prisma.raw_signal.update({
    where: { id: rawSignalId },
    data: {
      normalize_error: errorMessage.slice(0, 2000),
    },
  });
}

export async function cleanupOldRawSignals(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const result = await prisma.raw_signal.deleteMany({
    where: {
      fetched_at: { lt: cutoff },
      normalized_at: { not: null },
    },
  });

  return result.count;
}

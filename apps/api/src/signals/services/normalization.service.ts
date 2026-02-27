import { createHash } from 'crypto';
import { prisma } from '../../db/prisma';
import type { RawSignal } from '../providers/types';
import { normalizeWithGemini } from '../normalizers/gemini.normalizer';
import {
  cleanupOldRawSignals,
  getPendingRawSignalsByGrid,
  markRawSignalNormalizeError,
  markRawSignalNormalized,
} from './rawSignal.service';

type NormalizedSignalInsert = {
  grid_id: string;
  lat: number;
  lon: number;
  title: string;
  summary: string;
  event_type: string;
  event_source: string;
  confidence: number | null;
  signal_hash: string;
  event_time: Date;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${pairs.join(',')}}`;
}

export function computeSignalHash(gridId: string, rawSignal: RawSignal): string {
  const hash = createHash('sha256');
  hash.update(gridId);
  hash.update('|');
  hash.update(rawSignal.source);
  hash.update('|');
  hash.update(rawSignal.fetchKey);
  hash.update('|');
  hash.update(stableStringify(rawSignal.rawPayload));
  return hash.digest('hex');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Normalization failed';
}

type NormalizationRunResult = {
  processed: number;
  inserted: number;
  failed: number;
  deduped: number;
  cleanupCount: number;
};

export async function normalizeAndStoreSignals(params: {
  gridId: string;
  batchSize?: number;
}): Promise<NormalizationRunResult> {
  const { gridId, batchSize = 50 } = params;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const cleanupCount = await cleanupOldRawSignals();
    console.log(`normalizationService: grid=${gridId} skipped (missing GEMINI_API_KEY), cleanup=${cleanupCount}`);
    return { processed: 0, inserted: 0, failed: 0, deduped: 0, cleanupCount };
  }

  const pending = await getPendingRawSignalsByGrid(gridId, Math.max(1, batchSize));
  if (pending.length === 0) {
    const cleanupCount = await cleanupOldRawSignals();
    console.log(`normalizationService: grid=${gridId} pending=0 cleanup=${cleanupCount}`);
    return { processed: 0, inserted: 0, failed: 0, deduped: 0, cleanupCount };
  }

  let inserted = 0;
  let failed = 0;
  let deduped = 0;

  try {
    const byHash = pending.map((raw) => {
      const rawSignal: RawSignal = {
        source: raw.source,
        fetchKey: raw.fetch_key,
        rawPayload: raw.raw_payload,
      };
      return {
        rawId: raw.id,
        fetchedAt: raw.fetched_at,
        rawSignal,
        signalHash: computeSignalHash(gridId, rawSignal),
      };
    });

    const existing = await prisma.normalized_signal.findMany({
      where: { signal_hash: { in: byHash.map((item) => item.signalHash) } },
      select: { signal_hash: true },
    });
    const existingSet = new Set(existing.map((row) => row.signal_hash));

    for (const item of byHash) {
      if (existingSet.has(item.signalHash)) {
        deduped += 1;
        await markRawSignalNormalized(item.rawId);
        continue;
      }

      try {
        const normalized = await normalizeWithGemini([item.rawSignal]);
        if (normalized.length === 0) {
          failed += 1;
          await markRawSignalNormalizeError(item.rawId, 'Gemini returned empty normalization result');
          continue;
        }

        const first = normalized[0];
        const row: NormalizedSignalInsert = {
          grid_id: gridId,
          lat: first.lat,
          lon: first.lon,
          title: first.title,
          summary: first.summary,
          event_type: first.event_type,
          event_source: first.event_source,
          confidence: first.confidence,
          signal_hash: item.signalHash,
          event_time: item.fetchedAt,
        };
        const result = await prisma.normalized_signal.createMany({
          data: [row],
          skipDuplicates: true,
        });
        inserted += result.count;
        if (result.count === 0) {
          deduped += 1;
        }

        await markRawSignalNormalized(item.rawId);
      } catch (error) {
        failed += 1;
        await markRawSignalNormalizeError(item.rawId, toErrorMessage(error));
      }
    }
  } catch (error) {
    console.error('normalizationService run failed', error);
  }

  const cleanupCount = await cleanupOldRawSignals();
  const processed = pending.length;
  console.log(
    `normalizationService: grid=${gridId} processed=${processed} inserted=${inserted} failed=${failed} deduped=${deduped} cleanup=${cleanupCount}`
  );

  return { processed, inserted, failed, deduped, cleanupCount };
}

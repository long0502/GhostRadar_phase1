"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSignalHash = computeSignalHash;
exports.normalizeAndStoreSignals = normalizeAndStoreSignals;
const crypto_1 = require("crypto");
const prisma_1 = require("../../db/prisma");
const gemini_normalizer_1 = require("../normalizers/gemini.normalizer");
const rawSignal_service_1 = require("./rawSignal.service");
function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const obj = value;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
    return `{${pairs.join(',')}}`;
}
function computeSignalHash(gridId, rawSignal) {
    const hash = (0, crypto_1.createHash)('sha256');
    hash.update(gridId);
    hash.update('|');
    hash.update(rawSignal.source);
    hash.update('|');
    hash.update(rawSignal.fetchKey);
    hash.update('|');
    hash.update(stableStringify(rawSignal.rawPayload));
    return hash.digest('hex');
}
function toErrorMessage(error) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return 'Normalization failed';
}
async function normalizeAndStoreSignals(params) {
    const { gridId, batchSize = 50 } = params;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const cleanupCount = await (0, rawSignal_service_1.cleanupOldRawSignals)();
        console.log(`normalizationService: grid=${gridId} skipped (missing GEMINI_API_KEY), cleanup=${cleanupCount}`);
        return { processed: 0, inserted: 0, failed: 0, deduped: 0, cleanupCount };
    }
    const pending = await (0, rawSignal_service_1.getPendingRawSignalsByGrid)(gridId, Math.max(1, batchSize));
    if (pending.length === 0) {
        const cleanupCount = await (0, rawSignal_service_1.cleanupOldRawSignals)();
        console.log(`normalizationService: grid=${gridId} pending=0 cleanup=${cleanupCount}`);
        return { processed: 0, inserted: 0, failed: 0, deduped: 0, cleanupCount };
    }
    let inserted = 0;
    let failed = 0;
    let deduped = 0;
    try {
        const byHash = pending.map((raw) => {
            const rawSignal = {
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
        const existing = await prisma_1.prisma.normalized_signal.findMany({
            where: { signal_hash: { in: byHash.map((item) => item.signalHash) } },
            select: { signal_hash: true },
        });
        const existingSet = new Set(existing.map((row) => row.signal_hash));
        for (const item of byHash) {
            if (existingSet.has(item.signalHash)) {
                deduped += 1;
                await (0, rawSignal_service_1.markRawSignalNormalized)(item.rawId);
                continue;
            }
            try {
                const normalized = await (0, gemini_normalizer_1.normalizeWithGemini)([item.rawSignal]);
                if (normalized.length === 0) {
                    failed += 1;
                    await (0, rawSignal_service_1.markRawSignalNormalizeError)(item.rawId, 'Gemini returned empty normalization result');
                    continue;
                }
                const first = normalized[0];
                const row = {
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
                const result = await prisma_1.prisma.normalized_signal.createMany({
                    data: [row],
                    skipDuplicates: true,
                });
                inserted += result.count;
                if (result.count === 0) {
                    deduped += 1;
                }
                await (0, rawSignal_service_1.markRawSignalNormalized)(item.rawId);
            }
            catch (error) {
                failed += 1;
                await (0, rawSignal_service_1.markRawSignalNormalizeError)(item.rawId, toErrorMessage(error));
            }
        }
    }
    catch (error) {
        console.error('normalizationService run failed', error);
    }
    const cleanupCount = await (0, rawSignal_service_1.cleanupOldRawSignals)();
    const processed = pending.length;
    console.log(`normalizationService: grid=${gridId} processed=${processed} inserted=${inserted} failed=${failed} deduped=${deduped} cleanup=${cleanupCount}`);
    return { processed, inserted, failed, deduped, cleanupCount };
}

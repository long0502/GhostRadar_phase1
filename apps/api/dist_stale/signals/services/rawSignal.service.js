"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestRawSignals = ingestRawSignals;
exports.ingestRawSignalBatch = ingestRawSignalBatch;
exports.getPendingRawSignalsByGrid = getPendingRawSignalsByGrid;
exports.markRawSignalNormalized = markRawSignalNormalized;
exports.markRawSignalNormalizeError = markRawSignalNormalizeError;
exports.cleanupOldRawSignals = cleanupOldRawSignals;
const prisma_1 = require("../../db/prisma");
async function ingestRawSignals(provider, params) {
    const rawSignals = await provider.fetch(params);
    return ingestRawSignalBatch(rawSignals);
}
async function ingestRawSignalBatch(rawSignals) {
    if (rawSignals.length === 0) {
        return 0;
    }
    const result = await prisma_1.prisma.raw_signal.createMany({
        data: rawSignals.map((signal) => ({
            source: signal.source,
            fetch_key: signal.fetchKey,
            raw_payload: signal.rawPayload,
        })),
    });
    return result.count;
}
async function getPendingRawSignalsByGrid(gridId, limit) {
    return prisma_1.prisma.raw_signal.findMany({
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
async function markRawSignalNormalized(rawSignalId) {
    await prisma_1.prisma.raw_signal.update({
        where: { id: rawSignalId },
        data: {
            normalized_at: new Date(),
            normalize_error: null,
        },
    });
}
async function markRawSignalNormalizeError(rawSignalId, errorMessage) {
    await prisma_1.prisma.raw_signal.update({
        where: { id: rawSignalId },
        data: {
            normalize_error: errorMessage.slice(0, 2000),
        },
    });
}
async function cleanupOldRawSignals() {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const result = await prisma_1.prisma.raw_signal.deleteMany({
        where: {
            fetched_at: { lt: cutoff },
            normalized_at: { not: null },
        },
    });
    return result.count;
}

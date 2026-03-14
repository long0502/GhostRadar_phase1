"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../db/prisma");
const rss_provider_1 = require("./providers/rss.provider");
const gemini_normalizer_1 = require("./normalizers/gemini.normalizer");
const rawSignal_service_1 = require("./services/rawSignal.service");
const grid_1 = require("../utils/grid");
async function run() {
    const lat = 10.776;
    const lon = 106.7;
    const radiusKm = 5;
    const gridId = (0, grid_1.computeGridId)(lat, lon);
    const provider = new rss_provider_1.RssRawSignalProvider();
    const rawSignals = await provider.fetch({
        lat,
        lon,
        radiusKm,
        gridId,
    });
    console.log(`rawSignals.length: ${rawSignals.length}`);
    const firstPayload = rawSignals[0]?.rawPayload;
    const firstTitle = firstPayload?.title ??
        firstPayload?.['content:encoded'] ??
        firstPayload?.description ??
        '';
    console.log(`rawSignals[0].rawPayload.title: ${firstTitle}`);
    const inserted = await (0, rawSignal_service_1.ingestRawSignalBatch)(rawSignals);
    const normalized = await (0, gemini_normalizer_1.normalizeWithGemini)(rawSignals.slice(0, 2));
    console.log(`raw_signal inserted: ${inserted}`);
    console.log(`normalized count: ${normalized.length}`);
}
run()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});

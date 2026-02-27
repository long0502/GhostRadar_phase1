import { prisma } from '../db/prisma';
import { RssRawSignalProvider } from './providers/rss.provider';
import { normalizeWithGemini } from './normalizers/gemini.normalizer';
import { ingestRawSignalBatch } from './services/rawSignal.service';
import { computeGridId } from '../utils/grid';

async function run() {
  const lat = 10.776;
  const lon = 106.7;
  const radiusKm = 5;
  const gridId = computeGridId(lat, lon);

  const provider = new RssRawSignalProvider();
  const rawSignals = await provider.fetch({
    lat,
    lon,
    radiusKm,
    gridId,
  });
  console.log(`rawSignals.length: ${rawSignals.length}`);
  const firstPayload = rawSignals[0]?.rawPayload as Record<string, unknown> | undefined;
  const firstTitle =
    (firstPayload?.title as string | undefined) ??
    (firstPayload?.['content:encoded'] as string | undefined) ??
    (firstPayload?.description as string | undefined) ??
    '';
  console.log(`rawSignals[0].rawPayload.title: ${firstTitle}`);

  const inserted = await ingestRawSignalBatch(rawSignals);
  const normalized = await normalizeWithGemini(rawSignals.slice(0, 2));

  console.log(`raw_signal inserted: ${inserted}`);
  console.log(`normalized count: ${normalized.length}`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

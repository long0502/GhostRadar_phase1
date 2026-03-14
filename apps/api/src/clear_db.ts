import { config } from 'dotenv';
config();
import { prisma } from './db/prisma';

async function main() {
  console.log('Clearing registry via script...');
  try {
    const res = await prisma.$transaction([
      prisma.event_details.deleteMany(),
      prisma.grid_cache.deleteMany(),
      prisma.events.deleteMany(),
      prisma.raw_signal.deleteMany(),
      prisma.normalized_signal.deleteMany(),
      prisma.ingestion_run.deleteMany(),
    ]);
    console.log('Registry cleared successfully!', res);
  } catch (error) {
    console.error('Failed to clear registry:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

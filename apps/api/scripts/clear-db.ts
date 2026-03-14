import { prisma } from '../src/db/prisma';

async function main() {
  console.log('Cleaning database...');
  
  const tables = [
    'event_details',
    'events',
    'grid_cache',
    'jobs',
    'raw_signal',
    'normalized_signal',
    'ingestion_run',
    'ai_usage_daily'
    // 'ai_quota_policy' - Keep policies usually
  ];

  for (const table of tables) {
    try {
      await (prisma as any)[table].deleteMany({});
      console.log(`- Cleared ${table}`);
    } catch (e) {
      console.log(`- Failed to clear ${table} via Prisma (might be a view or missing model), trying raw TRUNCATE...`);
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
        console.log(`- Truncated ${table} via raw SQL`);
      } catch (err: any) {
        console.error(`- Could not clear ${table}: ${err.message}`);
      }
    }
  }

  console.log('Database clean complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

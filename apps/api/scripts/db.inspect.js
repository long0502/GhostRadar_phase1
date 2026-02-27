const { prisma } = require('../dist/db/prisma.js');

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename ASC
  `);
  const tableNames = rows.map((row) => row.tablename);
  const requiredTables = ['raw_signal', 'normalized_signal', 'ingestion_run'];

  console.log('public tables:');
  for (const row of rows) {
    console.log(`- ${row.tablename}`);
  }

  console.log('required table existence:');
  for (const tableName of requiredTables) {
    console.log(`- ${tableName}: ${tableNames.includes(tableName) ? 'YES' : 'NO'}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

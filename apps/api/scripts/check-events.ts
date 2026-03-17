import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const c = await p.events.count();
  console.log('Event count:', c);
  if (c > 0) {
    const ev = await p.events.findFirst();
    console.log('First event:', JSON.stringify(ev, null, 2).substring(0, 800));
  }
  const gc = await p.grid_cache.count();
  console.log('Grid cache count:', gc);
  if (gc > 0) {
    const g = await p.grid_cache.findFirst();
    console.log('Grid cache:', JSON.stringify(g, null, 2).substring(0, 300));
  }
  await p.$disconnect();
})();

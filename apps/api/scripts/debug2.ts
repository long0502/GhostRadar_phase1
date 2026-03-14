import { prisma } from '../src/db/prisma';
import * as fs from 'fs';

async function debugDb() {
  try {
    const detail = await prisma.event_details.findFirst({
      orderBy: { created_at: 'desc' },
    });
    
    fs.writeFileSync('debug2.json', JSON.stringify(detail, null, 2), 'utf-8');
    console.log('Saved debug2.json');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

debugDb();

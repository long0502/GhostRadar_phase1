import { prisma } from '../src/db/prisma';

async function debugDb() {
  try {
    const details = await prisma.event_details.findMany({
      orderBy: { created_at: 'desc' },
      take: 3
    });
    
    console.log('--- RECENT EVENT DETAILS ---');
    details.forEach((d, i) => {
      console.log(`\n[#${i+1}] ID: ${d.id}, EventID: ${d.event_id}`);
      console.log('STORY_TEXT prefix:', d.story_text?.substring(0, 100));
      console.log('DETAIL keys:', Object.keys(d.detail as any || {}));
      console.log('FULL DETAIL JSON:', JSON.stringify(d.detail, null, 2).substring(0, 300));
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

debugDb();

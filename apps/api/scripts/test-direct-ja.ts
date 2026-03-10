import { scanService } from '../src/services/scan.service';
import { prisma } from '../src/db/prisma';

async function testDirect() {
    console.log('--- DIRECT FUNCTION TEST: JAPANESE SCAN (TOKYO) ---');

    const input = {
        lat: 35.6895,
        lon: 139.6917,
        radiusKm: 2,
        lang: 'ja', // Force a completely new cache key
        logger: {
            info: (msg: any, meta: any) => console.log('[INFO]', msg, meta || ''),
            error: (msg: any, meta: any) => console.error('[ERROR]', msg, meta || ''),
            warn: (msg: any, meta: any) => console.warn('[WARN]', msg, meta || ''),
        } as any,
        requestId: 'test-tokyo-' + Date.now()
    };

    try {
        const result = await scanService(input);
        console.log('\n--- RESULT ---');
        console.log('Cache Status:', result.cacheStatus);

        const events = result.response.events as any[];
        console.log('Number of events:', events?.length);

        if (events && events.length > 0) {
            console.log('First 5 event titles:');
            events.slice(0, 5).forEach((e, i) => {
                console.log(`${i + 1}. ${e.title} (Localized: ${e.localizedTitle})`);
            });

            const containsEnglish = events.some((e: any) =>
                /[a-zA-Z]/.test(e.title) && !/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(e.title)
            );
            console.log('\nResult contains English-only titles?', containsEnglish);
        }
    } catch (error: any) {
        console.error('TEST FAILED:', error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

testDirect();

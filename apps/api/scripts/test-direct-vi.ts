import { scanService } from '../src/services/scan.service';
import { prisma } from '../src/db/prisma';

async function testDirect() {
    console.log('--- DIRECT FUNCTION TEST: VIETNAMESE SCAN (HANOI) ---');

    const input = {
        lat: 21.0285,
        lon: 105.8542,
        radiusKm: 2,
        lang: 'vi',
        logger: {
            info: (msg: any, meta: any) => console.log('[INFO]', msg, meta || ''),
            error: (msg: any, meta: any) => console.error('[ERROR]', msg, meta || ''),
            warn: (msg: any, meta: any) => console.warn('[WARN]', msg, meta || ''),
        } as any,
        requestId: 'test-hanoi-' + Date.now()
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

            const containsVietnamese = events.some((e: any) =>
                /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/.test(e.title)
            );
            console.log('\nResult contains Vietnamese characters?', containsVietnamese);

            if (events.length <= 15) {
                console.warn('\nWARNING: ONLY ' + events.length + ' EVENTS. THIS IS LIKELY THE SYNTHETIC FALLBACK OR GEMINI RETURNED VERY FEW.');
            }
        }
    } catch (error: any) {
        console.error('TEST FAILED:', error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

testDirect();

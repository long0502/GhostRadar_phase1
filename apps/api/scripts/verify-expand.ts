import { expandEventLevelOne } from '../src/services/event-expand.service';
import { prisma } from '../src/db/prisma';

async function verifyExpand() {
    console.log('--- GHOSTRADAR AI RESPONSE VERIFICATION ---');

    try {
        // 1. Get a random event to test with
        const event = await prisma.events.findFirst({
            where: { has_detail: false }
        }) || await prisma.events.findFirst();

        if (!event) {
            console.error('No events found in database to test with.');
            return;
        }

        console.log(`Testing with Event ID: ${event.id}`);
        console.log(`Event Title: ${(event.event_data as any).title}`);

        // 2. Call the expansion service
        const requestId = 'verify-' + Date.now();
        const result = await expandEventLevelOne(
            event.id,
            'vi', // Test with Vietnamese
            {
                info: (msg: any) => console.log('[API INFO]', msg),
                warn: (msg: any) => console.warn('[API WARN]', msg),
                error: (msg: any) => console.error('[API ERROR]', msg),
            } as any,
            requestId
        );

        if (result.notFound) {
            console.error('Event not found during expansion.');
            return;
        }

        if (result.aiFailure) {
            console.error('AI expansion failed.');
            return;
        }

        const record = result.detail;
        const detail = (record as any).detail as any;
        console.log('\n--- VERIFICATION RESULTS ---');
        console.log('Detail object fields:', Object.keys(detail));

        // 3. Verify Structure
        const requiredFields = ['story_text', 'witness', 'analysis', 'risk_assessment'];
        const missingFields = requiredFields.filter(f => !detail[f]);
        
        if (missingFields.length > 0) {
            console.error(`FAIL: Missing fields in detail: ${missingFields.join(', ')}`);
        } else {
            console.log('SUCCESS: All required top-level fields present.');
        }

        const riskFields = ['credibility', 'signal_type', 'site_sensitivity', 'recommendation'];
        const missingRiskFields = riskFields.filter(f => !detail.risk_assessment?.[f]);

        if (missingRiskFields.length > 0) {
            console.error(`FAIL: Missing fields in risk_assessment: ${missingRiskFields.join(', ')}`);
        } else {
            console.log('SUCCESS: All risk_assessment fields present.');
        }

        // 4. Verify No Duplication (Simple check)
        const story = detail.story_text || '';
        const witness = detail.witness || '';
        const analysis = detail.analysis || '';

        console.log('Story length:', story.length);
        console.log('Witness length:', witness.length);
        console.log('Analysis length:', analysis.length);

        if (witness.length > 50 && story.includes(witness.substring(0, 50))) {
            console.warn('WARNING: Potential duplication between story_text and witness.');
        } else {
            console.log('SUCCESS: No obvious duplication between story and witness.');
        }

        const recommendation = detail.risk_assessment?.recommendation || '';
        if (recommendation && analysis.toLowerCase().includes(recommendation.toLowerCase())) {
            console.warn('WARNING: Recommendation might be repeated in analysis.');
        } else {
            console.log('SUCCESS: Recommendation is distinct from analysis.');
        }

        // 5. Verify Content Length (Roughly)
        const storyLines = story.split('\n').filter((l: string) => l.trim().length > 0);
        console.log(`Story Length: ${storyLines.length} paragraphs`);
        
        if (storyLines.length > 5) {
            console.warn('WARNING: Story might be too long (max 5 paragraphs).');
        }

        console.log('\n--- FULL RESPONSE JSON ---');
        console.log(JSON.stringify(detail, null, 2));

    } catch (error: any) {
        console.error('VERIFICATION FAILED:', error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

verifyExpand();

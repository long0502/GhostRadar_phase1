async function verifyVietnamese() {
    const url = 'http://localhost:8088/scan';
    const payload = {
        lat: 10.7769,
        lon: 106.7009,
        radiusKm: 5,
        lang: 'vi',
        force: true
    };

    console.log('--- VERIFYING VIETNAMESE AI OUTPUT ---');
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        const events = (data as any).events || (data as any).events_json;

        console.log('X-Cache:', response.headers.get('x-cache'));
        console.log('Event Count:', events?.length);

        if (events && events.length > 0) {
            events.slice(0, 3).forEach((e: any, i: number) => {
                console.log(`\nEvent ${i + 1}:`);
                console.log('Title:', e.title);
                console.log('Teaser:', e.teaser);
            });

            const hasVietnameseMarkers = events.some((e: any) =>
                /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/.test(e.title + e.teaser)
            );
            console.log('\nStrict Vietnamese Check:', hasVietnameseMarkers ? 'PASSED' : 'FAILED');

            const hasEnglishLeakage = events.some((e: any) =>
                /\b(the|is|in|of|ghost|haunted|report|witness|rumor)\b/i.test(e.title)
            );
            console.log('English Leakage Check (low confidence):', hasEnglishLeakage ? 'POTENTIAL ISSUE' : 'CLEAN');
        }
    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verifyVietnamese();

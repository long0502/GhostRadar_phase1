async function testScan() {
    const url = 'http://localhost:8088/scan';
    const payload = {
        lat: 10.7749,
        lon: 106.7058,
        radiusKm: 2,
        lang: 'vi'
    };

    console.log('--- API TEST: VIETNAMESE SCAN ---');
    console.log('URL:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('Response Status:', response.status);
        console.log('Cache-Control:', response.headers.get('cache-control'));
        console.log('X-Cache:', response.headers.get('x-cache'));

        const data = await response.json();
        const events = (data as any).events;
        console.log('Number of events:', events?.length);

        if (events && events.length > 0) {
            console.log('\n--- SAMPLE EVENT (id: ' + events[0].id + ') ---');
            console.log('Title:', events[0].title);
            console.log('Localized Title:', events[0].localizedTitle);
            console.log('Teaser:', events[0].teaser);
            console.log('Type:', events[0].type);
            console.log('Coords:', events[0].lat + ', ' + events[0].lon);

            const containsVietnamese = events.some((e: any) =>
                /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/.test(e.title) ||
                /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/.test(e.teaser)
            );
            console.log('\nResult contains Vietnamese characters?', containsVietnamese);

            if (!containsVietnamese) {
                console.warn('\nWARNING: NO VIETNAMESE CHARACTERS DETECTED!');
            }
        }
    } catch (error) {
        console.error('API TEST FAILED:', error);
    }
}

testScan();

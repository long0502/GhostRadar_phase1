async function testScan() {
    console.log('Testing Turbo Scan API...');
    const url = 'http://localhost:8088/scan?force=true&radiusKm=10&lat=10.7749&lon=106.7058&lang=vi';
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        console.log('Status:', response.status);
        const data = await response.json();
        if (data.events) {
            console.log('Number of events returned:', data.events.length);
            if (data.events.length > 0) {
              console.log('First event:', data.events[0].title);
            }
        } else {
            console.log('Error/No Events:', data);
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}
testScan();

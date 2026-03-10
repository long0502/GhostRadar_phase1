
async function testSingle() {
    const model = 'gemini-2.0-flash';
    const apiKey = 'AIzaSyCJQ92LyWTO_TsC-AFY7WVuLPUZUOrHpCg';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`--- FINAL TEST: ${model} ---`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: "Write 'Hello' in Vietnamese. Return only the translation." }] }]
        })
    });

    const data = await response.json() as any;
    console.log('Status:', response.status);
    console.log('Body:', JSON.stringify(data, null, 2));
}

testSingle();


async function testGemini(model: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`\n--- TESTING MODEL: ${model} ---`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "Write 'Hello' in Vietnamese. Return only the translation." }] }]
            })
        });

        const data = await response.json() as any;
        if (response.ok) {
            console.log(`Response: ${data.candidates?.[0]?.content?.parts?.[0]?.text}`);
        } else {
            console.error(`Error ${response.status}: ${JSON.stringify(data.error, null, 2)}`);
        }
    } catch (err: any) {
        console.error(`Fetch failed: ${err.message}`);
    }
}

async function runTests() {
    await testGemini('gemini-1.5-flash');
    await testGemini('gemini-1.5-flash-latest');
    await testGemini('gemini-2.0-flash-exp');
    await testGemini('gemini-2.0-flash');
}

runTests();

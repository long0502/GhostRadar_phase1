
async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json() as any;
        console.log(JSON.stringify(data, null, 2));
    } catch (err: any) {
        console.error(err);
    }
}

listModels();

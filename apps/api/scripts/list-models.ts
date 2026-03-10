
async function listModels() {
    const apiKey = 'AIzaSyCJQ92LyWTO_TsC-AFY7WVuLPUZUOrHpCg';
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

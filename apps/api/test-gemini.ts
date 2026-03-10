import { callGemini } from './src/services/gemini.service';

async function test() {
    console.log('--- DIRECT GEMINI TEST ---');
    const targetLanguageName = 'Vietnamese';
    const lat = 10.7769;
    const lon = 106.7009;
    const radiusKm = 5;

    const prompt = `
[SYSTEM]
CRITICAL: You are an AI assistant generating paranormal radar scan events.
TARGET LANGUAGE: ${targetLanguageName}
You MUST write ALL fields ("title", "localizedTitle", "teaser") EXCLUSIVELY in ${targetLanguageName}. 
Do NOT use English or any other language for these fields, EVEN if your search results are in English.

[LOCATION CONTEXT]
City/Region: Detected from (${lat.toFixed(4)}, ${lon.toFixed(4)})
Scan Radius: ${radiusKm}km

[FOLKLORE STYLE GUIDE]
Apply cultural themes based on the region:
- Vietnam: tâm linh, hẻm ma, bệnh viện cũ, truyền thuyết dân gian
- Japan: yūrei, yokai, cursed locations, urban legends
- Europe: medieval curses, haunted castles, plague history
- Americas: local spirits, native legends, highway phantoms
- Other: Use common local paranormal myths

[OUTPUT RULES]
1. Return a JSON array of at least 3 events.
2. FIELDS: 
   - "title": (string) Short title in ${targetLanguageName}
   - "localizedTitle": (string) IDENTICAL to "title"
   - "type": (string) Category (e.g. ghost, curse, anomaly)
   - "lat", "lon": (numbers) Real coordinates within ${radiusKm}km
   - "teaser": (string) 2-3 atmospheric sentences in ${targetLanguageName}
   - "danger_level": (int 1-5)

[CONSTRAINTS & REFUSAL POLICY]
- NO English words in ${targetLanguageName} output (except proper names where absolutely necessary, but translate them if a localized version exists).
- If your internal search results (Google Search) are in English, you MUST translate the findings into ${targetLanguageName}.
- If you output English content for title or teaser, the request is a COMPLETE FAILURE.
- Use REAL local landmark names.
- Temperature is high, be creative but stay atmospheric.
`.trim();

    try {
        const result = await callGemini({
            endpoint: 'scan',
            prompt,
            responseMimeType: 'application/json',
            temperature: 0.9,
            aiCallsThisRequest: 1,
            tools: [
                {
                    googleSearchRetrieval: {
                        dynamicRetrievalConfig: {
                            mode: 'MODE_DYNAMIC',
                            dynamicThreshold: 0.3,
                        },
                    },
                },
            ],
        });
        console.log(result.text);
    } catch (e) {
        console.error(e);
    }
}
test();

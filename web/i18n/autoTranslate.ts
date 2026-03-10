export const translationCache: Record<string, Record<string, string>> = {};

export async function autoTranslate(text: string, targetLanguage: string, cacheId?: string): Promise<string> {
    if (!text || targetLanguage === 'en') return text; // Assume base text is English

    if (cacheId && translationCache[cacheId]?.[targetLanguage]) {
        return translationCache[cacheId][targetLanguage];
    }

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();

        // Google Translate free API returns an array where the first item is an array of translated sentences
        const translatedText = data[0].map((item: any) => item[0]).join('');

        if (cacheId) {
            if (!translationCache[cacheId]) translationCache[cacheId] = {};
            translationCache[cacheId][targetLanguage] = translatedText;
        }

        return translatedText;
    } catch (error) {
        console.error('[autoTranslate] Translation failed:', error);
        return text; // fallback to original
    }
}

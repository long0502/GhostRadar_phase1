import { LANGUAGE_STORAGE_KEY, SupportedLanguage, defaultLanguage, supportedLanguages } from './config';

/**
 * Maps browser locale strings to our supported language codes.
 * Handles country-specific variants (e.g. es-MX, pt-BR, zh-TW) by mapping to the base language.
 */
const BROWSER_LOCALE_MAP: Record<string, SupportedLanguage> = {
    // English variants
    'en': 'en', 'en-us': 'en', 'en-gb': 'en', 'en-au': 'en', 'en-ca': 'en', 'en-nz': 'en', 'en-in': 'en', 'en-sg': 'en',
    // Vietnamese
    'vi': 'vi', 'vi-vn': 'vi',
    // Japanese
    'ja': 'ja', 'ja-jp': 'ja',
    // Korean
    'ko': 'ko', 'ko-kr': 'ko',
    // Chinese variants → single "zh"
    'zh': 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh', 'zh-hk': 'zh', 'zh-sg': 'zh', 'zh-hans': 'zh', 'zh-hant': 'zh',
    // Thai
    'th': 'th', 'th-th': 'th',
    // Indonesian
    'id': 'id', 'id-id': 'id',
    // Filipino / Tagalog
    'fil': 'fil', 'tl': 'fil', 'tl-ph': 'fil', 'fil-ph': 'fil',
    // Malay
    'ms': 'ms', 'ms-my': 'ms', 'ms-sg': 'ms',
    // Spanish variants → single "es"
    'es': 'es', 'es-es': 'es', 'es-mx': 'es', 'es-ar': 'es', 'es-co': 'es', 'es-pe': 'es', 'es-cl': 'es', 'es-ve': 'es',
    // Portuguese variants → single "pt"
    'pt': 'pt', 'pt-br': 'pt', 'pt-pt': 'pt',
    // Italian
    'it': 'it', 'it-it': 'it',
    // Romanian
    'ro': 'ro', 'ro-ro': 'ro',
    // Turkish
    'tr': 'tr', 'tr-tr': 'tr',
};

function mapBrowserLocale(locale: string): SupportedLanguage {
    const lower = locale.toLowerCase();

    // Exact match first
    if (BROWSER_LOCALE_MAP[lower]) return BROWSER_LOCALE_MAP[lower];

    // Try base language code (before the dash)
    const base = lower.split('-')[0];
    if (BROWSER_LOCALE_MAP[base]) return BROWSER_LOCALE_MAP[base];

    // Check if the base exists in supportedLanguages directly
    if (supportedLanguages.some(l => l.code === base)) return base as SupportedLanguage;

    return defaultLanguage;
}

export function detectBrowserLanguage(): SupportedLanguage {
    if (typeof window === 'undefined') return defaultLanguage;

    // Prioritize saved preference
    const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY) as SupportedLanguage;
    if (savedLang && supportedLanguages.some(l => l.code === savedLang)) {
        return savedLang;
    }

    return mapBrowserLocale(navigator.language);
}

export function saveLanguagePreference(lang: SupportedLanguage) {
    if (typeof window !== 'undefined') {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
}

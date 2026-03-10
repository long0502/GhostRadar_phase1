export const supportedLanguages = [
    { code: 'en', name: 'English' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'zh', name: '中文' },
    { code: 'th', name: 'ไทย' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'fil', name: 'Filipino' },
    { code: 'ms', name: 'Bahasa Melayu' },
    { code: 'es', name: 'Español' },
    { code: 'pt', name: 'Português' },
    { code: 'it', name: 'Italiano' },
    { code: 'ro', name: 'Română' },
    { code: 'tr', name: 'Türkçe' },
] as const;

export type SupportedLanguage = typeof supportedLanguages[number]['code'];

export const defaultLanguage: SupportedLanguage = 'en';

export const LANGUAGE_STORAGE_KEY = 'ghostradar_language';

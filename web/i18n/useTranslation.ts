import { useCallback } from 'react';
import { useLanguage } from './LanguageContext';
import { translations } from './translations';

export function useTranslation() {
    const { language } = useLanguage();

    const t = useCallback(
        (key: string, params?: Record<string, string | number>) => {
            let text = translations[language]?.[key] || translations['en']?.[key] || key;

            if (params) {
                Object.entries(params).forEach(([k, v]) => {
                    text = text.replace(`{${k}}`, String(v));
                });
            }
            return text;
        },
        [language]
    );

    return { t, language };
}

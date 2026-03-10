'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SupportedLanguage, defaultLanguage } from './config';
import { detectBrowserLanguage, saveLanguagePreference } from './languageDetector';

type LanguageContextType = {
    language: SupportedLanguage;
    setLanguage: (lang: SupportedLanguage) => void;
    showGeoSuggestion: boolean;
    dismissGeoSuggestion: () => void;
    acceptGeoSuggestion: () => void;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<SupportedLanguage>(defaultLanguage);
    const [showGeoSuggestion, setShowGeoSuggestion] = useState(false);

    useEffect(() => {
        const detected = detectBrowserLanguage();
        setLanguageState(detected);

        // Geo suggestion via Timezone trick instead of intrusive Geolocation API
        // If user has not chosen a language manually, and timezone is Vietnam, suggest VI.
        if (detected !== 'vi') {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz === 'Asia/Ho_Chi_Minh' || tz === 'Asia/Saigon') {
                const hasDismissed = localStorage.getItem('ghostradar_lang_suggestion_dismissed');
                const hasSavedLang = localStorage.getItem('ghostradar_language');
                if (!hasDismissed && !hasSavedLang) {
                    setShowGeoSuggestion(true);
                }
            }
        }
    }, []);

    const setLanguage = (lang: SupportedLanguage) => {
        setLanguageState(lang);
        saveLanguagePreference(lang);
        if (showGeoSuggestion) setShowGeoSuggestion(false);
    };

    const dismissGeoSuggestion = () => {
        localStorage.setItem('ghostradar_lang_suggestion_dismissed', 'true');
        setShowGeoSuggestion(false);
    };

    const acceptGeoSuggestion = () => {
        setLanguage('vi');
        localStorage.setItem('ghostradar_lang_suggestion_dismissed', 'true');
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, showGeoSuggestion, dismissGeoSuggestion, acceptGeoSuggestion }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within LanguageProvider');
    return context;
}

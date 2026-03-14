export type { DetailedProfile } from './types';
import type { DetailedProfile } from './types';

const CACHE_HOURS = 48;
const CACHE_MS = CACHE_HOURS * 60 * 60 * 1000;

function getCacheKey(id: string, lang: string) {
    return `ghost_cache_${id}_${lang}`;
}

export function saveProfileToCache(profile: DetailedProfile) {
    if (typeof window === 'undefined') return;

    const key = getCacheKey(profile.location_id, profile.language);
    const dataToSave = {
        ...profile,
        timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(dataToSave));
}

export function getProfileFromCache(id: string, lang: string): DetailedProfile | null {
    if (typeof window === 'undefined') return null;

    const key = getCacheKey(id, lang);
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    try {
        const parsed = JSON.parse(cached) as DetailedProfile;
        if (Date.now() - parsed.timestamp < CACHE_MS) {
            return parsed; // Valid cache
        }
        // Expired
        localStorage.removeItem(key);
        return null;
    } catch (e) {
        console.error('Failed to parse cached profile', e);
        return null;
    }
}

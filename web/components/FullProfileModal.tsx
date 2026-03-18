import React, { useMemo, useState, useEffect } from 'react';
import type { DetailedProfile, RadarEvent } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { generateEventImage } from '@/lib/api';

type FullProfileModalProps = {
    profile: DetailedProfile | null;
    event: RadarEvent | null;
    isOpen: boolean;
    onClose: () => void;
    userLocation: { lat: number; lon: number } | null;
};

/**
 * Deduplicates and prepares sections for rendering.
 * Strictly enforces that we only show what's in the detail object.
 */
function prepareSections(sections: DetailedProfile['sections']): DetailedProfile['sections'] {
    return {
        story_text: (sections.story_text || '').trim(),
        witness: (sections.witness || '').trim(),
        analysis: (sections.analysis || '').trim(),
        legend_overview: (sections.legend_overview || '').trim(),
        chronological_history: (sections.chronological_history || '').trim(),
        witnesses: sections.witnesses || [],
        spectral_analysis: (sections.spectral_analysis || '').trim(),
        risk_assessment: (sections.risk_assessment || '').trim(),
        image_url: (sections.image_url || '').trim(),
    };
}

export function FullProfileModal({ profile, event, isOpen, onClose, userLocation }: FullProfileModalProps) {
    const { t } = useTranslation();
    const [asyncImageUrl, setAsyncImageUrl] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(true); // Start true — assume loading
    const [imageError, setImageError] = useState<string | null>(null);

    // Prepare and clean sections
    const cleanSections = useMemo(() => {
        if (!profile) return null;
        return prepareSections(profile.sections);
    }, [profile]);

    // Reset states when event changes
    useEffect(() => {
        setAsyncImageUrl(null);
        setImageLoading(false); // DISABLED: no image quota
        setImageError(null);
    }, [event?.id]);

    // Async image generation — DISABLED (no image generation quota)
    // To re-enable: remove the early return below
    useEffect(() => {
        if (!isOpen || !event || !cleanSections) return;

        // If the detail already has an image (from cache), use it
        const existingUrl = cleanSections.image_url;
        if (existingUrl && existingUrl.length > 10) {
            setAsyncImageUrl(existingUrl);
            setImageLoading(false);
            return;
        }

        // DISABLED: Image generation — uncomment when API quota is available
        setImageLoading(false);
        return;

        /*
        setAsyncImageUrl(null);
        setImageLoading(true);
        setImageError(null);
        let cancelled = false;

        generateEventImage(event.id)
            .then((result) => {
                if (cancelled) return;
                if (result.image_url && result.image_url.length > 10) {
                    setAsyncImageUrl(result.image_url);
                } else if (result.error) {
                    setImageError(result.error);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setImageError(err instanceof Error ? err.message : 'Image generation failed');
            })
            .finally(() => {
                if (!cancelled) setImageLoading(false);
            });

        return () => { cancelled = true; };
        */
    }, [isOpen, event?.id, cleanSections?.image_url]);

    if (!isOpen || !profile || !event || !cleanSections) return null;

    const toRad = (v: number) => (v * Math.PI) / 180;
    let distanceStr = '0.00';
    if (userLocation) {
        const R = 6371;
        const dLat = toRad(event.lat - userLocation.lat);
        const dLon = toRad(event.lon - userLocation.lon);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(userLocation.lat)) * Math.cos(toRad(event.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distanceStr = d.toFixed(2);
    }

    const displayImageUrl = asyncImageUrl || cleanSections.image_url;

    return (
        <div className={`fixed inset-0 z-[200] pointer-events-none flex justify-center items-center transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
            <div className="w-full h-full max-w-[880px] bg-black/45 backdrop-blur-[15px] pointer-events-auto flex flex-col border-x border-[#00ff41]/20 shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,255,65,0.03)] font-mono overflow-y-auto text-[#00ff41] relative">
                {/* Top Navigation */}
                <div className="sticky top-0 z-10 w-full bg-black/80 backdrop-blur border-b border-[#00ff41]/30 p-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
                    <button
                        onClick={onClose}
                        className="hover:bg-[#00ff41]/20 px-4 py-2 text-sm border border-[#00ff41] rounded uppercase tracking-widest transition-colors"
                    >
                        &lt; {t('backToRadar')}
                    </button>
                    <button className="flex items-center gap-2 hover:bg-[#00ff41]/20 px-4 py-2 border border-[#00ff41]/50 rounded text-xs uppercase cursor-not-allowed opacity-50">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        NGHE TOÀN BỘ (Sắp ra mắt)
                    </button>
                </div>

                <div className="max-w-5xl mx-auto px-6 py-12 md:px-12">
                    {/* Hero Section */}
                    <div className="mb-16 border-l-8 border-red-600 pl-6">
                        <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                            {event.localizedTitle || event.title}
                        </h1>
                        <div className="flex flex-wrap gap-6 text-sm text-[#00ff41]/80 font-mono tracking-widest uppercase">
                            <span className="text-red-500 font-bold">{t('classification')}: {event.legend_type || event.type || 'UNKNOWN'}</span>
                            <span className="text-red-500 font-bold">{t('distanceLabel')}: {distanceStr} KM</span>
                            <span>{t('coordinates')}: {event.lat.toFixed(4)}, {event.lon.toFixed(4)}</span>
                        </div>
                    </div>

                    {/* Tactical Image Section */}
                    <div className="w-full aspect-video bg-[#111] border border-[#00ff41]/20 rounded-xl mb-16 relative overflow-hidden group shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay z-10 pointer-events-none"></div>
                        
                        {displayImageUrl && displayImageUrl.length > 10 ? (
                            <img 
                                src={displayImageUrl} 
                                alt="Event Visual"
                                className="w-full h-full object-cover grayscale brightness-75 contrast-125 opacity-80 animate-[fadeIn_0.5s_ease-in]"
                            />
                        ) : imageLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                                {/* Scanning animation */}
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 border-4 border-[#00ff41]/10 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-transparent border-t-[#00ff41] rounded-full animate-spin"></div>
                                    <div className="absolute inset-2 border-4 border-transparent border-b-[#00ff41]/50 rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
                                    <div className="absolute inset-0 flex items-center justify-center text-[#00ff41]/80 text-[10px] uppercase">
                                        AI
                                    </div>
                                </div>
                                <div className="text-[#00ff41]/60 text-sm uppercase tracking-widest animate-pulse font-bold">
                                    ĐANG TẠO HÌNH ẢNH PHỤC DỰNG...
                                </div>
                                <div className="text-[#00ff41]/30 text-[10px] tracking-wider">
                                    AI IMAGE GENERATION IN PROGRESS
                                </div>
                                {/* Progress bar animation */}
                                <div className="w-48 h-1 bg-[#00ff41]/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#00ff41]/50 rounded-full animate-[progressSlide_2s_ease-in-out_infinite]" style={{width: '60%'}}></div>
                                </div>
                            </div>
                        ) : imageError ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400/50">
                                <div className="text-sm uppercase tracking-widest">[ TÍN HIỆU HÌNH ẢNH THẤT BẠI ]</div>
                                <div className="text-[10px] text-red-400/30">{imageError}</div>
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[#00ff41]/20">
                                [ CAMERA FEED UNAVAILABLE - NO SIGNAL ]
                            </div>
                        )}

                        {/* Scanline effect */}
                        <div className="absolute top-0 w-full h-1 bg-[#00ff41]/20 shadow-[0_0_10px_#00ff41] animate-[scanline_4s_linear_infinite] z-20"></div>

                        <div className="absolute top-4 right-4 bg-red-600 text-black text-[10px] font-bold px-2 py-1 uppercase rounded-sm z-30">
                            {imageLoading ? 'ĐANG TẠO...' : imageError ? 'LỖI' : 'HÌNH ẢNH_PHỤC_DỰNG'}
                        </div>
                    </div>

                    {/* Content Blocks - 5-Part Structure */}
                    <div className="space-y-16 max-w-4xl">
                        <Section 
                            title={t('dossierLegendOverview')} 
                            badge={t('badgeSpectralData')} 
                            text={cleanSections.legend_overview} 
                        />
                        <Section 
                            title={t('dossierChronologicalHistory')} 
                            badge={t('badgeArchives')} 
                            text={cleanSections.chronological_history} 
                        />

                        {/* Witness Cards */}
                        {cleanSections.witnesses && cleanSections.witnesses.length > 0 && (
                            <div className="relative pl-6 md:pl-8 border-l border-[#00ff41]/30">
                                <div className="absolute left-[-5px] top-6 w-2.5 h-2.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]"></div>
                                <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest mb-2 block">{t('badgeWitness')}</span>
                                <h2 className="text-2xl font-bold uppercase tracking-wide mb-6 text-white">
                                    {t('dossierWitnesses')}
                                </h2>
                                <div className="space-y-6">
                                    {cleanSections.witnesses.map((w, i) => (
                                        <div key={i} className="bg-black/40 border border-[#00ff41]/20 rounded-lg p-6 relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-red-600"></div>
                                            <div className="flex items-center justify-between mb-4">
                                                <span className="text-white font-bold text-lg tracking-wide uppercase">
                                                    {w.name}
                                                </span>
                                                <span className="text-[10px] text-red-400 font-mono tracking-widest bg-red-900/30 px-2 py-1 rounded">
                                                    {w.date}
                                                </span>
                                            </div>
                                            <div className="text-[#00ff41]/90 text-base leading-relaxed whitespace-pre-line italic opacity-90 pl-4 border-l-2 border-[#00ff41]/20">
                                                &ldquo;{w.testimony}&rdquo;
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <Section 
                            title={t('dossierSpectralAnalysis')} 
                            badge={t('badgeTechnical')} 
                            text={cleanSections.spectral_analysis} 
                        />
                        <Section 
                            title={t('dossierRiskAssessment')} 
                            badge={t('badgeDangerLevel')} 
                            text={cleanSections.risk_assessment} 
                            isDanger 
                        />
                    </div>

                    <div className="mt-24 pt-12 border-t border-[#00ff41]/20 flex flex-col items-center">
                        <p className="text-xs text-[#00ff41]/50 tracking-widest uppercase mb-6 text-center">
                            {t('endOfReport')} - GHOST RADAR PRO v3.2<br />
                            [DATA ENCRYPTED]
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Section({ title, text, badge, isDanger = false }: { title: string, text?: string, badge: string, isDanger?: boolean }) {
    if (!text || text.length < 5) return null;
    return (
        <div className="relative pl-6 md:pl-8 border-l border-[#00ff41]/30">
            <div className="absolute left-[-5px] top-6 w-2.5 h-2.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]"></div>
            <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest mb-2 block">{badge}</span>
            <h2 className={`text-2xl font-bold uppercase tracking-wide mb-6 ${isDanger ? 'text-red-500' : 'text-white'}`}>
                {title}
            </h2>
            <div className="text-[#00ff41]/90 text-lg leading-relaxed space-y-4 whitespace-pre-line font-medium opacity-90">
                {text}
            </div>
        </div>
    );
}

import React, { useEffect, useMemo, useState } from 'react';
import type { DetailedProfile, RadarEvent } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { generateEventImage, resolveApiAssetUrl } from '@/lib/api';

type FullProfileModalProps = {
    profile: DetailedProfile | null;
    event: RadarEvent | null;
    isOpen: boolean;
    onClose: () => void;
    userLocation: { lat: number; lon: number } | null;
};

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

function isRenderableImageUrl(value: string | null | undefined): value is string {
    if (typeof value !== 'string') return false;

    const trimmed = value.trim();
    if (trimmed.length <= 10) return false;

    return !trimmed.toLowerCase().includes('chatgpt.com/backend-api/');
}

function isLocalEventImageUrl(value: string | null | undefined): value is string {
    if (typeof value !== 'string') return false;
    return value.trim().startsWith('/events/images/');
}

function normalizeImageErrorMessage(message: string | null): string {
    const normalized = (message || '').trim().toLowerCase();

    if (!normalized) {
        return 'Khung phản chiếu vẫn chưa ổn định. Hồ sơ này tạm thời không hiển thị được hình ảnh.';
    }

    if (normalized.includes('no image prompt')) {
        return 'Hồ sơ này chưa để lại đủ dấu vết thị giác để phục dựng một khung ảnh rõ nét.';
    }

    if (normalized.includes('invalid image') || normalized.includes('usable image')) {
        return 'Tín hiệu hình ảnh thu được quá méo và không đủ ổn định để đưa vào hồ sơ.';
    }

    return 'Manh mối thị giác vừa tan biến trước khi được ghi lại. Thử lại sau khi tín hiệu lắng hơn.';
}

function LoadingImageState() {
    return (
        <div className="absolute inset-0 flex items-center justify-center text-[#00ff41]/20">
            <div className="flex max-w-md flex-col items-center justify-center gap-4 px-6 text-center text-[#00ff41]">
                <div className="relative h-24 w-24">
                    <div className="absolute inset-0 rounded-full border-4 border-[#00ff41]/10"></div>
                    <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#00ff41]"></div>
                    <div
                        className="absolute inset-2 animate-spin rounded-full border-4 border-transparent border-b-[#00ff41]/50"
                        style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.3em] text-[#00ff41]/80">
                        PHASE
                    </div>
                </div>
                <div className="text-sm font-bold uppercase tracking-[0.3em] text-red-500">
                    PHẢN CHIẾU ĐANG THỨC DẬY
                </div>
                <div className="animate-pulse text-lg font-bold uppercase tracking-widest text-[#00ff41]/80">
                    ĐANG KẾT TÍN HIỆU HÌNH ẢNH
                </div>
                <p className="text-sm leading-relaxed text-[#00ff41]/65">
                    Lớp sương dữ liệu đang từ từ kết lại. Khi dấu vết đủ sáng, khung ảnh sẽ hiện ra trong hồ sơ.
                </p>
                <div className="h-1 w-52 overflow-hidden rounded-full bg-[#00ff41]/10">
                    <div
                        className="h-full animate-[progressSlide_2s_ease-in-out_infinite] rounded-full bg-[#00ff41]/50"
                        style={{ width: '60%' }}
                    ></div>
                </div>
            </div>
        </div>
    );
}

function SlowImageState() {
    return (
        <div className="absolute inset-0 flex items-center justify-center text-[#00ff41]/20">
            <div className="flex max-w-md flex-col items-center justify-center gap-4 px-6 text-center text-[#00ff41]">
                <div className="text-sm font-bold uppercase tracking-[0.3em] text-red-500">
                    TÍN HIỆU TRỄ
                </div>
                <div className="text-lg font-bold uppercase tracking-widest text-[#00ff41]">
                    KHUNG PHẢN CHIẾU CHƯA ỔN ĐỊNH
                </div>
                <p className="text-sm leading-relaxed text-[#00ff41]/70">
                    Màn sương trên hồ sơ đang dày hơn bình thường. Hình ảnh sẽ xuất hiện ngay khi dấu vết thị giác đủ rõ.
                </p>
                <div className="h-1 w-56 overflow-hidden rounded-full bg-[#00ff41]/10">
                    <div
                        className="h-full animate-[progressSlide_2.6s_ease-in-out_infinite] rounded-full bg-red-500/60"
                        style={{ width: '45%' }}
                    ></div>
                </div>
            </div>
        </div>
    );
}

function FailedImageState({ message }: { message: string }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center text-[#00ff41]/20">
            <div className="flex max-w-md flex-col items-center justify-center gap-4 px-6 text-center text-[#00ff41]">
                <div className="text-sm font-bold uppercase tracking-[0.3em] text-red-500">
                    NHIỄU LOẠN THỊ GIÁC
                </div>
                <div className="text-lg font-bold uppercase tracking-widest text-[#00ff41]">
                    KHÔNG THỂ PHỤC DỰNG HÌNH ẢNH
                </div>
                <p className="text-sm leading-relaxed text-[#00ff41]/70">{normalizeImageErrorMessage(message)}</p>
            </div>
        </div>
    );
}

export function FullProfileModal({ profile, event, isOpen, onClose, userLocation }: FullProfileModalProps) {
    const { t } = useTranslation();
    const [asyncImageUrl, setAsyncImageUrl] = useState<string | null>(null);
    const [imageWaitExceeded, setImageWaitExceeded] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);

    const cleanSections = useMemo(() => {
        if (!profile) return null;
        return prepareSections(profile.sections);
    }, [profile]);

    useEffect(() => {
        setAsyncImageUrl(null);
        setImageWaitExceeded(false);
        setImageError(null);
    }, [event?.id]);

    useEffect(() => {
        if (!isOpen || !event || !cleanSections) return;

        const existingUrl = cleanSections.image_url;
        if (isLocalEventImageUrl(existingUrl)) {
            setAsyncImageUrl(existingUrl);
            setImageWaitExceeded(false);
            setImageError(null);
            return;
        }

        if (isRenderableImageUrl(existingUrl)) {
            setAsyncImageUrl(existingUrl);
        } else {
            setAsyncImageUrl(null);
        }

        setImageError(null);
        let cancelled = false;
        let pollTimer: number | null = null;
        const slowTimer = window.setTimeout(() => {
            if (!cancelled) {
                setImageWaitExceeded(true);
            }
        }, 15000);

        const requestImage = async (attempt: number): Promise<void> => {
            try {
                const result = await generateEventImage(event.id);
                if (cancelled) return;

                if (result.error) {
                    window.clearTimeout(slowTimer);
                    setAsyncImageUrl(null);
                    setImageWaitExceeded(false);
                    setImageError(normalizeImageErrorMessage(result.error));
                    return;
                }

                if (isRenderableImageUrl(result.image_url)) {
                    window.clearTimeout(slowTimer);
                    setAsyncImageUrl(result.image_url);
                    setImageWaitExceeded(false);
                    setImageError(null);
                    return;
                }

                if ((result.pending || !result.image_url) && attempt < 40) {
                    pollTimer = window.setTimeout(() => {
                        void requestImage(attempt + 1);
                    }, 10000);
                    return;
                }

                window.clearTimeout(slowTimer);
                setAsyncImageUrl(null);
                setImageWaitExceeded(false);
                setImageError(normalizeImageErrorMessage('usable image missing'));
            } catch (_) {
                if (cancelled) return;

                if (attempt < 6) {
                    pollTimer = window.setTimeout(() => {
                        void requestImage(attempt + 1);
                    }, 8000);
                    return;
                }

                window.clearTimeout(slowTimer);
                setImageWaitExceeded(false);
                setImageError(normalizeImageErrorMessage(null));
            }
        };

        void requestImage(0);

        return () => {
            cancelled = true;
            window.clearTimeout(slowTimer);
            if (pollTimer !== null) {
                window.clearTimeout(pollTimer);
            }
        };
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
            Math.cos(toRad(userLocation.lat)) *
                Math.cos(toRad(event.lat)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distanceStr = d.toFixed(2);
    }

    const displayImageUrl = isRenderableImageUrl(asyncImageUrl)
        ? asyncImageUrl
        : isRenderableImageUrl(cleanSections.image_url)
          ? cleanSections.image_url
          : '';
    const resolvedDisplayImageUrl = displayImageUrl ? resolveApiAssetUrl(displayImageUrl) : '';
    const noiseOverlayStyle = {
        backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08) 0.6px, transparent 1px), radial-gradient(circle at 80% 35%, rgba(255,255,255,0.05) 0.6px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.06))',
        backgroundSize: '9px 9px, 13px 13px, 100% 100%',
    } as const;

    return (
        <div
            className={`fixed inset-0 z-[200] flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
                isOpen ? 'opacity-100' : 'opacity-0'
            }`}
        >
            <div className="relative flex h-full w-full max-w-[880px] flex-col overflow-y-auto border-x border-[#00ff41]/20 bg-black/45 font-mono text-[#00ff41] shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,255,65,0.03)] backdrop-blur-[15px] pointer-events-auto">
                <div className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-[#00ff41]/30 bg-black/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.8)] backdrop-blur">
                    <button
                        onClick={onClose}
                        className="rounded border border-[#00ff41] px-4 py-2 text-sm uppercase tracking-widest transition-colors hover:bg-[#00ff41]/20"
                    >
                        &lt; {t('backToRadar')}
                    </button>
                    <button className="flex cursor-not-allowed items-center gap-2 rounded border border-[#00ff41]/50 px-4 py-2 text-xs uppercase opacity-50 hover:bg-[#00ff41]/20">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                        NGHE TOAN BO (SAP RA MAT)
                    </button>
                </div>

                <div className="mx-auto max-w-5xl px-6 py-12 md:px-12">
                    <div className="mb-16 border-l-8 border-red-600 pl-6">
                        <h1 className="mb-4 text-4xl font-black uppercase tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] md:text-6xl">
                            {event.localizedTitle || event.title}
                        </h1>
                        <div className="flex flex-wrap gap-6 text-sm font-mono uppercase tracking-widest text-[#00ff41]/80">
                            <span className="font-bold text-red-500">
                                {t('classification')}: {event.legend_type || event.type || 'UNKNOWN'}
                            </span>
                            <span className="font-bold text-red-500">
                                {t('distanceLabel')}: {distanceStr} KM
                            </span>
                        </div>
                    </div>

                    <div className="max-w-4xl space-y-16">
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

                        {cleanSections.witnesses && cleanSections.witnesses.length > 0 && (
                            <div className="relative border-l border-[#00ff41]/30 pl-6 md:pl-8">
                                <div className="absolute left-[-5px] top-6 h-2.5 w-2.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]"></div>
                                <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-red-500">
                                    {t('badgeWitness')}
                                </span>
                                <h2 className="mb-6 text-2xl font-bold uppercase tracking-wide text-white">
                                    {t('dossierWitnesses')}
                                </h2>
                                <div className="space-y-6">
                                    {cleanSections.witnesses.map((w, i) => (
                                        <div
                                            key={i}
                                            className="relative overflow-hidden rounded-lg border border-[#00ff41]/20 bg-black/40 p-6"
                                        >
                                            <div className="absolute left-0 top-0 h-full w-1 bg-red-600"></div>
                                            <div className="mb-4 flex items-center justify-between">
                                                <span className="text-lg font-bold uppercase tracking-wide text-white">
                                                    {w.name}
                                                </span>
                                                <span className="rounded bg-red-900/30 px-2 py-1 font-mono text-[10px] tracking-widest text-red-400">
                                                    {w.date}
                                                </span>
                                            </div>
                                            <div className="whitespace-pre-line border-l-2 border-[#00ff41]/20 pl-4 text-base italic leading-relaxed text-[#00ff41]/90 opacity-90">
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

                        <div className="relative border-l border-[#00ff41]/30 pl-6 md:pl-8">
                            <div className="absolute left-[-5px] top-6 h-2.5 w-2.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]"></div>
                            <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-red-500">
                                TÀI LIỆU HÌNH ẢNH
                            </span>
                            <h2 className="mb-6 text-2xl font-bold uppercase tracking-wide text-white">
                                PHỤC DỰNG THỊ GIÁC
                            </h2>
                            <div className="group relative aspect-video w-full overflow-hidden rounded-xl border border-[#00ff41]/20 bg-[#111] shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                                <div
                                    className="pointer-events-none absolute inset-0 z-10 opacity-20 mix-blend-overlay"
                                    style={noiseOverlayStyle}
                                ></div>

                                {resolvedDisplayImageUrl && resolvedDisplayImageUrl.length > 10 ? (
                                    <img
                                        src={resolvedDisplayImageUrl}
                                        alt="Event Visual"
                                        className="h-full w-full animate-[fadeIn_0.5s_ease-in] object-cover grayscale brightness-75 contrast-125 opacity-80"
                                    />
                                ) : imageError ? (
                                    <FailedImageState message={imageError} />
                                ) : imageWaitExceeded ? (
                                    <SlowImageState />
                                ) : (
                                    <LoadingImageState />
                                )}

                                <div className="absolute top-0 z-20 h-1 w-full animate-[scanline_4s_linear_infinite] bg-[#00ff41]/20 shadow-[0_0_10px_#00ff41]"></div>

                                <div className="absolute right-4 top-4 z-30 rounded-sm bg-red-600 px-2 py-1 text-[10px] font-bold uppercase text-black">
                                    {resolvedDisplayImageUrl && resolvedDisplayImageUrl.length > 10
                                        ? 'PHỤC DỰNG'
                                        : imageError
                                          ? 'NHIỄU LOẠN'
                                          : 'ĐANG KẾT NỐI'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-24 flex flex-col items-center border-t border-[#00ff41]/20 pt-12">
                        <p className="mb-6 text-center text-xs uppercase tracking-widest text-[#00ff41]/50">
                            {t('endOfReport')} - GHOST RADAR PRO v3.2
                            <br />
                            [DATA ENCRYPTED]
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Section({
    title,
    text,
    badge,
    isDanger = false,
}: {
    title: string;
    text?: string;
    badge: string;
    isDanger?: boolean;
}) {
    if (!text || text.length < 5) return null;
    return (
        <div className="relative border-l border-[#00ff41]/30 pl-6 md:pl-8">
            <div className="absolute left-[-5px] top-6 h-2.5 w-2.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]"></div>
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-red-500">{badge}</span>
            <h2 className={`mb-6 text-2xl font-bold uppercase tracking-wide ${isDanger ? 'text-red-500' : 'text-white'}`}>
                {title}
            </h2>
            <div className="space-y-4 whitespace-pre-line text-lg font-medium leading-relaxed text-[#00ff41]/90 opacity-90">
                {text}
            </div>
        </div>
    );
}

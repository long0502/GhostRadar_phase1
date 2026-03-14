import React, { memo } from 'react';
import { RadarEvent } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type SummaryPanelProps = {
    event: RadarEvent | null;
    isOpen: boolean;
    onExploreClick: () => void;
    onClose: () => void;
    userLocation: { lat: number; lon: number } | null;
};

export const SummaryPanel = memo(({ event, isOpen, onExploreClick, onClose, userLocation }: SummaryPanelProps) => {
    const { t } = useTranslation();

    if (!isOpen || !event) return null;

    // Haversine calculation for robust distance if not precalculated
    const calcDistance = () => {
        if (!userLocation) return '0.00';
        const toRad = (v: number) => (v * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(event.lat - userLocation.lat);
        const dLon = toRad(event.lon - userLocation.lon);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(userLocation.lat)) * Math.cos(toRad(event.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return d.toFixed(2);
    };

    const distance = calcDistance();

    return (
        <div
            className={`fixed inset-0 z-[100] flex justify-center items-center transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
        >
            <div className="w-full h-full max-w-[880px] bg-black/45 backdrop-blur-[15px] flex flex-col p-6 md:p-12 justify-between mx-auto border-x border-[#00ff41]/20 shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,255,65,0.03)] overflow-y-auto relative">

                {/* Top Section */}
                <div>
                    <button
                        onClick={onClose}
                        className="text-[#00ff41] hover:bg-[#00ff41]/20 px-3 py-1.5 mb-6 rounded-sm border border-[#00ff41]/40 text-[10px] md:text-xs font-mono uppercase tracking-widest inline-flex items-center"
                    >
                        &lt; {t('close')}
                    </button>

                    <div className="mb-6 relative">
                        <div className="border-l-[6px] border-[#e60000] pl-4 py-2">
                            <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter leading-[1.1] mb-4 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                                {event.localizedTitle || event.title}
                            </h2>

                            <div className="inline-flex gap-4 text-[9px] md:text-[10px] items-center font-mono uppercase tracking-widest border border-[#333] px-3 py-1.5 rounded-sm">
                                <span className="text-[#e60000] font-bold">PHÂN LOẠI: {event.legend_type || event.type || 'UNKNOWN'}</span>
                                <span className="text-[#e60000] font-bold">KHOẢNG CÁCH: {distance} KM</span>
                                <span className="text-[#e60000] font-bold">MỨC ĐỘ: {event.danger_level_text || event.danger_level || 'Safe'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-black/80 border border-[#00ff41]/20 rounded-xl p-5 md:p-6 shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                        <p className="text-[#00ff41] italic text-base md:text-lg leading-relaxed font-mono drop-shadow-[0_0_8px_rgba(0,255,65,0.3)] font-semibold">
                            "{event.tagline || event.teaser}"
                        </p>
                    </div>
                </div>

                {/* Middle Action Section with Glow */}
                <div className="flex flex-col items-center justify-center flex-1 relative mt-8 mb-4">
                    {/* Background glow */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(circle at center, rgba(0,255,65,0.15) 0%, transparent 60%)' }}
                    ></div>

                    <button
                        onClick={onExploreClick}
                        className="relative z-10 w-[80%] max-w-[300px] bg-transparent border-2 border-[#00ff41] text-[#00ff41] font-bold py-4 rounded-none hover:bg-[#00ff41] hover:text-black transition-colors duration-300 uppercase tracking-widest group shadow-[0_0_15px_rgba(0,255,65,0.2)]"
                    >
                        KHAI THÁC HỒ SƠ CHI TIẾT
                    </button>
                    <p className="text-[8px] md:text-[9px] text-[#00ff41]/40 text-center mt-3 font-mono uppercase tracking-widest z-10">
                        YÊU CẦU QUYỀN TRUY CẬP HỒ SƠ BẢO MẬT CAO
                    </p>
                </div>

                {/* Bottom Exit Button */}
                <button
                    onClick={onClose}
                    className="w-full bg-[#00ff41] text-force-black font-black py-4 uppercase tracking-[0.3em] text-sm hover:brightness-110 active:brightness-90 transition-all rounded-sm shadow-[0_0_20px_rgba(0,255,65,0.4)]"
                >
                    THOÁT HỒ SƠ
                </button>
            </div>
        </div>
    );
});

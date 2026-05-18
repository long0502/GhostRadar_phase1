import React, { useState, useEffect } from 'react';

type LoadingProfileProps = {
    queueLength?: number;
    estimatedWaitSec?: number;
};

export function LoadingProfile({ queueLength, estimatedWaitSec }: LoadingProfileProps = {}) {
    const [msgIndex, setMsgIndex] = useState(0);

    const messages = [
        'Đang lần theo hồi âm cũ trong hồ sơ...',
        'Đang ghép lời khai từ những bóng nhân chứng...',
        'Đang phục dựng truyền thuyết địa phương...',
        'Đang giải mã dải tần của tín hiệu lạ...',
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setMsgIndex((prev) => (prev + 1) % messages.length);
        }, 1500);
        return () => clearInterval(timer);
    }, [messages.length]);

    return (
        <div className="fixed inset-0 z-[200] pointer-events-none flex justify-center items-center">
            <div className="w-full h-full max-w-[880px] bg-black/45 backdrop-blur-[15px] pointer-events-auto flex flex-col items-center justify-center font-mono p-4 border-x border-[#00ff41]/20 shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,255,65,0.03)] relative">
                <div className="relative w-32 h-32 mb-8 flex justify-center items-center">
                    <div className="absolute inset-0 border-4 border-[#00ff41]/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
                    <div className="absolute inset-4 border-2 border-red-500/30 rounded-full"></div>
                    <div className="absolute inset-4 border-2 border-red-500 border-b-transparent rounded-full animate-[spin_2s_linear_infinite_reverse]"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-xs">
                        <span className="text-[#00ff41] animate-pulse whitespace-nowrap">0x{Math.floor(Math.random() * 10000).toString(16).substring(0, 4)}</span>
                    </div>
                </div>

                <h2 className="text-[#00ff41] text-2xl uppercase tracking-widest font-bold mb-4 drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]">
                    TRUY XUẤT HỒ SƠ
                </h2>

                <div className="h-6 flex items-center justify-center">
                    <p className="text-[#00ff41]/70 tracking-widest text-sm uppercase animate-pulse">
                        {messages[msgIndex]}
                    </p>
                </div>

                {queueLength != null && queueLength > 0 && (
                    <div className="mt-4 px-4 py-2 rounded-xl border border-yellow-500/40 bg-yellow-500/5">
                        <p className="text-yellow-400 text-xs tracking-wider uppercase text-center">
                            NGHI THỨC ĐANG XẾP HÀNG: {queueLength} linh ảnh chờ gọi tên
                            {estimatedWaitSec != null && estimatedWaitSec > 0 ? ` - ~${estimatedWaitSec}s` : ''}
                        </p>
                    </div>
                )}

                <div className="w-64 h-1 bg-[#111] mt-8 overflow-hidden rounded-full">
                    <div className="h-full bg-[#00ff41] w-0 animate-[loading-bar_3s_ease-out_forwards]"></div>
                </div>

                <style dangerouslySetInnerHTML={{
                    __html: `
         @keyframes loading-bar {
           0% { width: 0%; }
           100% { width: 100%; }
         }
       `}} />
            </div>
        </div>
    );
}

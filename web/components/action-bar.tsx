'use client';

import { useTranslation } from '@/i18n/useTranslation';

type ActionBarProps = {
  isScanning: boolean;
  canScan: boolean;
  showLabels: boolean;
  isTurbo: boolean;
  isMuted: boolean;
  onScan: (radiusKm: number) => void;
  onToggleLabels: () => void;
  onToggleTurbo: () => void;
  onToggleMute: () => void;
  onClear: () => void;
};

export function ActionBar({
  isScanning,
  canScan,
  showLabels,
  isTurbo,
  isMuted,
  onScan,
  onToggleLabels,
  onToggleTurbo,
  onToggleMute,
  onClear,
}: ActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-[480px] px-4">
      <div className="mx-auto flex w-full flex-col gap-2 rounded-[24px] border border-[#00ff41] bg-black p-3 shadow-radar">
        <button
          type="button"
          onClick={() => onScan(isTurbo ? 10 : 5)}
          disabled={!canScan || isScanning}
          data-testid="scan-action"
          className={`relative flex h-14 w-full items-center justify-center rounded-xl border border-[#00ff41] px-3 transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50 ${isScanning
            ? 'animate-button-pulse animate-scan-gradient shadow-[0_0_30px_rgba(0,255,65,0.6)] opacity-100'
            : 'bg-[#00ff41] shadow-[0_0_20px_rgba(0,255,65,0.4)]'
            }`}
        >
          <span
            className={`relative z-50 font-bold text-force-black ${isScanning ? 'animate-scanning uppercase tracking-[4px]' : ''
              }`}
            style={{
              fontFamily: 'var(--font-space-mono), monospace',
              fontSize: isScanning ? '22px' : '32px',
            }}
          >
            {isScanning ? t('scanning') : t('scan')}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleTurbo}
          disabled={isScanning}
          className={`h-14 w-full rounded-xl border border-[#00ff41] px-3 text-sm font-medium transition-all duration-200 ${isTurbo ? 'bg-[#ff0000] text-white border-red-500 shadow-[0_0_15px_#ff0000]' : 'bg-black text-[#00ff41]'
            }`}
        >
          {isTurbo ? t('turboOn') : t('turboOff')}
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onToggleLabels}
            className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-2 text-xs font-medium text-[#00ff41]"
          >
            {showLabels ? t('labelsOn') : t('labelsOff')}
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className={`h-14 w-full rounded-xl border px-2 text-xs font-medium transition-all duration-200 ${isMuted ? 'bg-black text-gray-500 border-gray-600' : 'bg-black text-[#00ff41] border-[#00ff41]'}`}
          >
            {isMuted ? t('soundOff') : t('soundOn')}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-2 text-xs font-medium text-[#00ff41]"
          >
            {t('clear')}
          </button>
        </div>
      </div>
    </div >
  );
}

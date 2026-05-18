'use client';

import { useTranslation } from '@/i18n/useTranslation';

type ActionBarProps = {
  isScanning: boolean;
  canScan: boolean;
  showLabels: boolean;
  isTurbo: boolean;
  isMuted: boolean;
  onScan: (radiusKm: number) => void;
  onChooseLocation: () => void;
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
  onChooseLocation,
  onToggleLabels,
  onToggleTurbo,
  onToggleMute,
  onClear,
}: ActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-[480px] px-2 sm:px-4">
      <div className="mx-auto flex w-full flex-col gap-2 rounded-[24px] border border-[#00ff41] bg-black/95 p-3 shadow-radar backdrop-blur-sm">
        <button
          type="button"
          onClick={() => onScan(isTurbo ? 10 : 5)}
          disabled={!canScan || isScanning}
          data-testid={isTurbo ? 'scan-10km' : 'scan-5km'}
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
              fontSize: isScanning ? 'clamp(18px, 5vw, 22px)' : 'clamp(24px, 7vw, 32px)',
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleLabels}
            className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-2 text-[11px] font-medium text-[#00ff41] sm:text-xs"
          >
            {showLabels ? t('labelsOn') : t('labelsOff')}
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className={`h-14 w-full rounded-xl border px-2 text-[11px] font-medium transition-all duration-200 sm:text-xs ${isMuted ? 'bg-black text-gray-500 border-gray-600' : 'bg-black text-[#00ff41] border-[#00ff41]'}`}
          >
            {isMuted ? t('soundOff') : t('soundOn')}
          </button>
          <button
            type="button"
            onClick={onChooseLocation}
            disabled={isScanning}
            className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-2 text-[11px] font-medium text-[#00ff41] disabled:opacity-50 sm:text-xs"
          >
            {t('selectLocation')}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-2 text-[11px] font-medium text-[#00ff41] sm:text-xs"
          >
            {t('clear')}
          </button>
        </div>
      </div>
    </div >
  );
}

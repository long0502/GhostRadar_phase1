'use client';

type ActionBarProps = {
  isScanning: boolean;
  canScan: boolean;
  showLabels: boolean;
  onScan: (radiusKm: 5 | 10) => void;
  onToggleLabels: () => void;
  onClear: () => void;
};

export function ActionBar({
  isScanning,
  canScan,
  showLabels,
  onScan,
  onToggleLabels,
  onClear,
}: ActionBarProps) {
  return (
    <div className="w-full max-w-[480px] px-4">
      <div className="mx-auto flex w-full flex-col gap-2 rounded-[24px] border border-[#00ff41] bg-black p-3 shadow-radar">
        <button
          type="button"
          onClick={() => onScan(5)}
          disabled={!canScan || isScanning}
          data-testid="scan-5km"
          className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-3 text-sm font-medium text-[#00ff41] disabled:opacity-50"
        >
          Scan 5km
        </button>
        <button
          type="button"
          onClick={() => onScan(10)}
          disabled={!canScan || isScanning}
          className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-3 text-sm font-medium text-[#00ff41] disabled:opacity-50"
        >
          Scan 10km
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleLabels}
            className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-3 text-sm font-medium text-[#00ff41]"
          >
            {showLabels ? 'Labels On' : 'Labels Off'}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="h-14 w-full rounded-xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41]"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

export function RadarOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[300] overflow-hidden">
      <div className="radar-sweep absolute left-1/2 top-1/2 aspect-square h-[90vw] w-[90vw] max-h-[65vh] max-w-[65vh] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00ff41] shadow-[0_0_18px_#00ff41]" />
    </div>
  );
}

'use client';

import { memo } from 'react';

type RadarBlipProps = {
  x: number;
  y: number;
  color: string;
  rotation: number;
  lat: number;
  lon: number;
  centerLat: number;
  centerLon: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick?: () => void;
};

export const RadarBlip = memo(function RadarBlip({
  x,
  y,
  color,
  rotation,
  lat,
  lon,
  centerLat,
  centerLon,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: RadarBlipProps) {
  // Step 1 — Compute angle of each blip (North = 0, Clockwise)
  const angleToPoint = ((Math.atan2(lon - centerLon, lat - centerLat) * 180) / Math.PI + 360) % 360;

  // Step 2 — Compute angular distance from sweep
  const normalizedRotation = (rotation + 360) % 360;
  const angleDiff = (normalizedRotation - angleToPoint + 360) % 360;

  // Step 3 — Define sweep trail (wider for longer persistence)
  const trailWidth = 120;

  // Step 4 — Compute brightness
  let opacity = 0.25; // Higher base opacity for better visibility
  let scale = 1.0;

  if (angleDiff < trailWidth) {
    const t = 1 - angleDiff / trailWidth;
    opacity = 0.25 + t * 0.75;
    scale = 1.0 + t * 0.5; // Slightly larger pop
  }

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className="pointer-events-auto cursor-crosshair"
    >
      {/* Step 6 — Add glow halo */}
      <circle
        cx={x}
        cy={y}
        r={7 * scale}
        fill={color}
        opacity={opacity}
        className="transition-opacity duration-75"
        style={{ filter: 'drop-shadow(0 0 12px currentColor)' }}
      />
      {/* Step 5 — Render blip */}
      <circle
        cx={x}
        cy={y}
        r={3.5 * scale}
        fill={color}
        opacity={opacity}
        className="transition-opacity duration-75"
      />
    </g>
  );
});

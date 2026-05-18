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
  const angleToPoint = ((Math.atan2(lon - centerLon, lat - centerLat) * 180) / Math.PI + 360) % 360;
  const normalizedRotation = (rotation + 360) % 360;
  const angleDiff = (normalizedRotation - angleToPoint + 360) % 360;
  const trailWidth = 120;

  let opacity = 0.28;
  let scale = 1.0;

  if (angleDiff < trailWidth) {
    const t = 1 - angleDiff / trailWidth;
    opacity = 0.28 + t * 0.72;
    scale = 1.0 + t * 0.5;
  }

  return (
    <g
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className="pointer-events-auto cursor-crosshair"
    >
      <circle
        cx={x}
        cy={y}
        r={10.5 * scale}
        fill={color}
        opacity={Math.min(0.26, opacity * 0.22)}
        className="radar-event-blip__bloom transition-opacity duration-75"
      />
      <circle
        cx={x}
        cy={y}
        r={7 * scale}
        fill={color}
        opacity={opacity}
        className="radar-event-blip__glow transition-opacity duration-75"
        style={{ filter: 'drop-shadow(0 0 12px currentColor)' }}
      />
      <circle
        cx={x}
        cy={y}
        r={3.5 * scale}
        fill={color}
        opacity={opacity}
        className="radar-event-blip__core transition-opacity duration-75"
      />
      <circle
        cx={x}
        cy={y}
        r={1.9 * scale}
        fill="#dcffe8"
        opacity={Math.min(1, opacity * 0.98)}
        className="radar-event-blip__spark transition-opacity duration-75"
      />
    </g>
  );
});

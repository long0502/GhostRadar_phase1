'use client';

import { memo, useMemo, useState } from 'react';
import { RadarBlip } from './RadarBlip';
import type { RadarEvent } from '@/lib/types';

/** Max characters for a blip label before truncation */
const LABEL_MAX_CHARS = 18;
/** Max number of labels shown simultaneously to prevent clutter */
const MAX_VISIBLE_LABELS = 8;

function truncateLabel(text: string): string {
    if (text.length <= LABEL_MAX_CHARS) return text;
    return text.slice(0, LABEL_MAX_CHARS - 1).trimEnd() + '…';
}

type RadarProps = {
    userLocation: { lat: number; lon: number } | null;
    events: RadarEvent[];
    radiusKm: number;
    rotation: number;
    showLabels?: boolean;
    onBlipClick?: (eventId: string) => void;
};

type BlipData = {
    id: string;
    title: string;
    x: number;
    y: number;
    color: string;
    distanceKm: number;
    dangerLevel: number;
    lat: number;
    lon: number;
};

export const Radar = memo(function Radar({
    userLocation,
    events,
    radiusKm,
    rotation,
    showLabels = false,
    onBlipClick,
}: RadarProps) {
    const [hoveredBlipId, setHoveredBlipId] = useState<string | null>(null);
    const size = 440; // Matches .radar-frame size
    const center = size / 2;

    const blips: BlipData[] = useMemo(() => {
        if (!userLocation) return [];

        const { lat: centerLat, lon: centerLon } = userLocation;

        function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) *
                Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
            const φ1 = lat1 * Math.PI / 180;
            const φ2 = lat2 * Math.PI / 180;
            const Δλ = (lon2 - lon1) * Math.PI / 180;

            const y = Math.sin(Δλ) * Math.cos(φ2);
            const x = Math.cos(φ1) * Math.sin(φ2) -
                Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

            return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        }

        return events
            .map((event) => {
                const distance = getDistanceKm(centerLat, centerLon, event.lat, event.lon);

                if (distance > radiusKm) return null;

                const bearing = getBearing(centerLat, centerLon, event.lat, event.lon);
                const angle = bearing * Math.PI / 180;
                const normalizedDistance = distance / radiusKm;
                const r = normalizedDistance * (size / 2);

                const x = center + r * Math.sin(angle);
                const y = center - r * Math.cos(angle);

                const dangerLevel = event.danger_level ?? event.severity ?? 1;
                const color =
                    dangerLevel === 1 ? '#3fa36a' :
                        dangerLevel === 2 ? '#b89b3c' :
                            dangerLevel === 3 ? '#b86d3c' :
                                dangerLevel === 4 ? '#a33f3f' : '#8f3535';

                return {
                    id: event.id,
                    title: event.localizedTitle || event.title || 'Unknown Signal',
                    x,
                    y,
                    color,
                    distanceKm: distance,
                    dangerLevel,
                    lat: event.lat,
                    lon: event.lon,
                };
            })
            .filter((blip): blip is NonNullable<typeof blip> => blip !== null);
    }, [events, userLocation, radiusKm, size, center]);

    // Pick the top N highest-priority blips for label rendering
    const labelBlips = useMemo(() => {
        if (!showLabels) return [];
        return [...blips]
            .sort((a, b) => b.dangerLevel - a.dangerLevel)
            .slice(0, MAX_VISIBLE_LABELS);
    }, [blips, showLabels]);

    // Single hovered blip for preview card
    const hoveredBlip = useMemo(
        () => blips.find((b) => b.id === hoveredBlipId) ?? null,
        [blips, hoveredBlipId]
    );

    if (!userLocation) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-10">
            <svg
                viewBox={`0 0 ${size} ${size}`}
                className="h-full w-full"
                style={{ filter: 'drop-shadow(0 0 4px rgba(0, 255, 65, 0.2))' }}
            >
                {blips.map((blip) => (
                    <RadarBlip
                        key={blip.id}
                        x={blip.x}
                        y={blip.y}
                        color={blip.color}
                        rotation={rotation}
                        lat={blip.lat}
                        lon={blip.lon}
                        centerLat={userLocation.lat}
                        centerLon={userLocation.lon}
                        onMouseEnter={() => setHoveredBlipId(blip.id)}
                        onMouseLeave={() => setHoveredBlipId(null)}
                        onClick={() => onBlipClick?.(blip.id)}
                    />
                ))}
            </svg>

            {/* Short truncated labels for top-priority blips only */}
            {showLabels && labelBlips.map((blip) => (
                <div
                    key={`label-${blip.id}`}
                    className="absolute text-[10px] font-bold text-[#00ff41] pointer-events-none whitespace-nowrap opacity-60 mix-blend-screen"
                    style={{
                        left: blip.x + 8,
                        top: blip.y - 4,
                        textShadow: '0 0 4px rgba(0, 255, 65, 0.5)'
                    }}
                >
                    {truncateLabel(blip.title)}
                </div>
            ))}

            {/* Hover preview card — only ONE signal at a time */}
            {hoveredBlip && (
                <div
                    className="blip-tooltip"
                    style={{
                        left: hoveredBlip.x,
                        top: hoveredBlip.y - 12
                    }}
                >
                    <div className="blip-tooltip-title">{hoveredBlip.title}</div>
                    <div className="blip-tooltip-dist">
                        {hoveredBlip.distanceKm < 1
                            ? `${(hoveredBlip.distanceKm * 1000).toFixed(0)}m`
                            : `${hoveredBlip.distanceKm.toFixed(2)}km`}
                    </div>
                </div>
            )}
        </div>
    );
});

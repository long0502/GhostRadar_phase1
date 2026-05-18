'use client';

import { memo, useMemo, useState } from 'react';
import { RadarBlip } from './RadarBlip';
import type { RadarEvent } from '@/lib/types';

const LABEL_MAX_CHARS = 18;
const MAX_VISIBLE_LABELS = 8;

function truncateLabel(text: string): string {
    if (text.length <= LABEL_MAX_CHARS) return text;
    return text.slice(0, LABEL_MAX_CHARS - 1).trimEnd() + '...';
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x =
        Math.cos(phi1) * Math.sin(phi2) -
        Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getBlipColor(dangerLevel: number): string {
    return dangerLevel === 1 ? '#3fa36a' :
        dangerLevel === 2 ? '#b89b3c' :
            dangerLevel === 3 ? '#b86d3c' :
                dangerLevel === 4 ? '#a33f3f' : '#8f3535';
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
    xPct: number;
    yPct: number;
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
    const size = 440;
    const center = size / 2;

    const blips: BlipData[] = useMemo(() => {
        if (!userLocation) return [];

        const { lat: centerLat, lon: centerLon } = userLocation;
        const enriched = events.map((event) => {
            const distance = getDistanceKm(centerLat, centerLon, event.lat, event.lon);
            const bearing = getBearing(centerLat, centerLon, event.lat, event.lon);
            const dangerLevel = event.danger_level ?? event.severity ?? 1;
            return {
                event,
                distance,
                bearing,
                dangerLevel,
            };
        });

        const inRange = enriched.filter((item) => item.distance <= radiusKm);
        const hasInRange = inRange.length > 0;
        const source = hasInRange ? inRange : enriched;

        const fallbackRadiusKm = hasInRange
            ? radiusKm
            : Math.max(
                radiusKm,
                source.reduce((max, item) => Math.max(max, item.distance), 0)
            );

        return source.map((item) => {
            const angle = item.bearing * Math.PI / 180;
            const normalizedDistance = Math.min(0.96, item.distance / Math.max(0.001, fallbackRadiusKm));
            const radialDistance = normalizedDistance * (size / 2);
            const x = center + radialDistance * Math.sin(angle);
            const y = center - radialDistance * Math.cos(angle);

            return {
                id: item.event.id,
                title: item.event.localizedTitle || item.event.title || 'Unknown Signal',
                x,
                y,
                xPct: (x / size) * 100,
                yPct: (y / size) * 100,
                color: getBlipColor(item.dangerLevel),
                distanceKm: item.distance,
                dangerLevel: item.dangerLevel,
                lat: item.event.lat,
                lon: item.event.lon,
            };
        });
    }, [events, userLocation, radiusKm, size, center]);

    const labelBlips = useMemo(() => {
        if (!showLabels) return [];
        return [...blips]
            .sort((a, b) => b.dangerLevel - a.dangerLevel)
            .slice(0, MAX_VISIBLE_LABELS);
    }, [blips, showLabels]);

    const hoveredBlip = useMemo(
        () => blips.find((blip) => blip.id === hoveredBlipId) ?? null,
        [blips, hoveredBlipId]
    );

    if (!userLocation) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-10">
            <svg
                viewBox={`0 0 ${size} ${size}`}
                className="h-full w-full"
                style={{ filter: 'drop-shadow(0 0 4px rgba(0, 255, 65, 0.2))' }}
                data-testid="radar-blip-layer"
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

            {showLabels && labelBlips.map((blip) => (
                <div
                    key={`label-${blip.id}`}
                    className="absolute whitespace-nowrap text-[10px] font-bold text-[#00ff41] opacity-60 mix-blend-screen pointer-events-none"
                    style={{
                        left: `${blip.xPct}%`,
                        top: `${blip.yPct}%`,
                        transform: 'translate(8px, -4px)',
                        textShadow: '0 0 4px rgba(0, 255, 65, 0.5)',
                    }}
                >
                    {truncateLabel(blip.title)}
                </div>
            ))}

            {hoveredBlip && (
                <div
                    className="blip-tooltip hidden md:block"
                    style={{
                        left: `${hoveredBlip.xPct}%`,
                        top: `${hoveredBlip.yPct}%`,
                        marginTop: '-12px',
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

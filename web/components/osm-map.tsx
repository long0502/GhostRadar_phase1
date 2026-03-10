'use client';

import { memo, useMemo } from 'react';

type OSMMapProps = {
    lat: number;
    lon: number;
    radiusKm: number;
};

export const OSMMap = memo(function OSMMap({ lat, lon, radiusKm }: OSMMapProps) {
    const bbox = useMemo(() => {
        // Zoom factor logic: smaller zoom factor = higher zoom level
        // Base 0.09 for 10km radius (~10km / 111.32km/deg)
        const zoomFactor = 0.09 * (radiusKm / 10);
        const west = lon - zoomFactor;
        const south = lat - zoomFactor;
        const east = lon + zoomFactor;
        const north = lat + zoomFactor;
        return `${west},${south},${east},${north}`;
    }, [lat, lon, radiusKm]);

    return (
        <div className="h-full w-full overflow-hidden bg-black">
            <iframe
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`}
                className="neon-map"
                title="Radar Background Map"
                scrolling="no"
            />
        </div>
    );
});

'use client';

import { memo, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type OSMMapClientProps = {
    lat: number;
    lon: number;
    radiusKm: number;
};

function radiusToZoom(radiusKm: number): number {
    if (radiusKm <= 3) return 14;
    if (radiusKm <= 5) return 13;
    if (radiusKm <= 8) return 12;
    return 11;
}

function MapViewport({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();

    useEffect(() => {
        map.setView(center, zoom, { animate: false });
    }, [map, center, zoom]);

    return null;
}

export const OSMMapClient = memo(function OSMMapClient({ lat, lon, radiusKm }: OSMMapClientProps) {
    const center = useMemo<[number, number]>(() => [lat, lon], [lat, lon]);
    const zoom = useMemo(() => radiusToZoom(radiusKm), [radiusKm]);
    const bbox = useMemo(() => {
        const zoomFactor = 0.09 * (radiusKm / 10);
        const west = lon - zoomFactor;
        const south = lat - zoomFactor;
        const east = lon + zoomFactor;
        const north = lat + zoomFactor;
        return `${west},${south},${east},${north}`;
    }, [lat, lon, radiusKm]);

    return (
        <div data-testid="map-container" className="h-full w-full overflow-hidden bg-black">
            <MapContainer
                center={center}
                zoom={zoom}
                zoomControl={false}
                dragging={false}
                doubleClickZoom={false}
                scrollWheelZoom={false}
                touchZoom={false}
                keyboard={false}
                attributionControl={false}
                className="neon-map md:hidden"
                style={{ width: '100%', height: '100%' }}
            >
                <MapViewport center={center} zoom={zoom} />
                <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
            </MapContainer>
            <iframe
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`}
                className="neon-map hidden md:block"
                title="Radar Background Map"
                scrolling="no"
                loading="lazy"
            />
        </div>
    );
});

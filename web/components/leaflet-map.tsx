'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RadarEvent } from '@/lib/types';

type LeafletMapProps = {
  center: [number, number];
  events: RadarEvent[];
  showLabels: boolean;
  radiusKm: number;
  sweepRotationRef: React.MutableRefObject<number>;
  onMarkerClick: (event: RadarEvent) => void;
};

const severityColors: Record<number, string> = {
  1: '#00ff41',
  2: '#d7ff00',
  3: '#ffaa00',
  4: '#ff3300',
  5: '#ff0000',
};

function radarIcon(level: number) {
  const color = severityColors[level] ?? severityColors[1];

  return L.divIcon({
    className: 'radar-blip',
    html: `<div class="radar-dot" data-color="${color}" style="background:${color}"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMeters = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getRadiusBounds(center: [number, number], radiusMeters: number): L.LatLngBoundsExpression {
  const [lat, lon] = center;
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.0001));

  return [
    [lat - latDelta, lon - lonDelta],
    [lat + latDelta, lon + lonDelta],
  ];
}

function MapBehavior({ center, radiusMeters }: { center: [number, number]; radiusMeters: number }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(getRadiusBounds(center, radiusMeters), { animate: false, padding: [0, 0] });
    map.whenReady(() => {
      setTimeout(() => map.invalidateSize(), 0);
    });
    map.dragging.disable();
    map.scrollWheelZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
  }, [map, center, radiusMeters]);

  return null;
}

export function LeafletMap({
  center,
  events,
  showLabels,
  radiusKm,
  sweepRotationRef,
  onMarkerClick,
}: LeafletMapProps) {
  const [mounted, setMounted] = useState(false);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let frame = 0;

    const animate = () => {
      for (const event of events) {
        const marker = markerRefs.current[event.id];
        const el = marker?.getElement();
        if (!el) {
          continue;
        }
        const dot = el.querySelector<HTMLElement>('.radar-dot');
        if (!dot) {
          continue;
        }

        const bearing = getBearing(center[0], center[1], event.lat, event.lon);
        const distanceMeters = getDistanceMeters(center[0], center[1], event.lat, event.lon);
        const selectedRadiusMeters = Math.max(radiusKm * 1000, 1);
        const distanceRatio = distanceMeters / selectedRadiusMeters;
        const baseIntensity = Math.max(1 - Math.pow(distanceRatio, 1.5), 0.08);
        const delta = (sweepRotationRef.current - bearing + 360) % 360;
        const glowZone = 50;
        const sweepBoost = delta < glowZone ? 1 - delta / glowZone : 0;
        const finalIntensity = Math.min(Math.max(baseIntensity * 0.6 + sweepBoost * 0.8, 0), 1);

        const baseTransform = dot.dataset.baseTransform ?? 'scale(1)';
        if (!dot.dataset.baseTransform) {
          dot.dataset.baseTransform = baseTransform;
        }

        const markerColor = dot.dataset.color ?? severityColors[1];
        dot.style.opacity = String(0.15 + finalIntensity * 0.85);
        dot.style.transform = `scale(${1 + finalIntensity * 0.35})`;
        dot.style.boxShadow = `0 0 ${4 + finalIntensity * 16}px ${markerColor}`;
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [center, events, sweepRotationRef]);

  const radiusMeters = useMemo(() => radiusKm * 1000, [radiusKm]);

  if (!mounted) {
    return null;
  }

  return (
    <div data-testid="map-container" className="h-full w-full">
      <MapContainer
        center={center}
        zoom={13}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <MapBehavior center={center} radiusMeters={radiusMeters} />
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        {showLabels ? (
          <TileLayer
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          />
        ) : null}
        {events.map((event) => (
          <Marker
            key={event.id}
            ref={(marker) => {
              markerRefs.current[event.id] = marker;
            }}
            position={[event.lat, event.lon]}
            icon={radarIcon(event.danger_level ?? event.severity ?? 1)}
            eventHandlers={{
              click: () => onMarkerClick(event),
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}

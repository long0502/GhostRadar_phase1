'use client';

import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type LocationPickerMapProps = {
  center: [number, number];
  selected: [number, number];
  onSelect: (lat: number, lon: number) => void;
};

const pickerIcon = L.divIcon({
  className: 'picker-map-pin',
  html: '<div class="picker-map-pin__dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function MapViewport({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: false });
  }, [map, center]);

  return null;
}

function MapClickCapture({
  onSelect,
}: {
  onSelect: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export function LocationPickerMap({
  center,
  selected,
  onSelect,
}: LocationPickerMapProps) {
  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-[#00ff41]/50">
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom
        doubleClickZoom
        touchZoom
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <MapViewport center={center} />
        <MapClickCapture onSelect={onSelect} />
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={selected} icon={pickerIcon} />
      </MapContainer>
    </div>
  );
}

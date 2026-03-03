'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from '@/components/action-bar';
import { BottomSheet } from '@/components/bottom-sheet';
import { LeafletMap } from '@/components/leaflet-map-wrapper';
import { scanArea } from '@/lib/api';
import type { RadarEvent } from '@/lib/types';

type GeoState =
  | { status: 'loading' }
  | { status: 'denied'; lat: string; lon: string }
  | { status: 'ready'; lat: number; lon: number };

type UserLocation = {
  lat: number;
  lon: number;
};

const DEFAULT_HCMC = {
  lat: 10.7769,
  lon: 106.7009,
};

const DEFAULT_SCAN_RADIUS_KM = 10;

const RadarMapSurface = memo(function RadarMapSurface({
  userLocation,
  events,
  selectedEventId,
  showLabels,
  scanRadiusKm,
  sweepRotationRef,
  onMarkerClick,
}: {
  userLocation: UserLocation | null;
  events: RadarEvent[];
  selectedEventId: string | null;
  showLabels: boolean;
  scanRadiusKm: number;
  sweepRotationRef: React.MutableRefObject<number>;
  onMarkerClick: (event: RadarEvent) => void;
}) {
  if (!userLocation) {
    return <div className="h-full w-full bg-black" />;
  }

  return (
    <LeafletMap
      center={[userLocation.lat, userLocation.lon]}
      events={events}
      showLabels={showLabels}
      radiusKm={scanRadiusKm}
      sweepRotationRef={sweepRotationRef}
      onMarkerClick={onMarkerClick}
    />
  );
});

const RadarScope = memo(function RadarScope({
  userLocation,
  events,
  selectedEventId,
  showLabels,
  scanRadiusKm,
  onMarkerClick,
}: {
  userLocation: UserLocation | null;
  events: RadarEvent[];
  selectedEventId: string | null;
  showLabels: boolean;
  scanRadiusKm: number;
  onMarkerClick: (event: RadarEvent) => void;
}) {
  const sweepRef = useRef<HTMLDivElement>(null);
  const sweepRotationRef = useRef(0);

  useEffect(() => {
    let frame: number;
    let angle = 0;

    const animate = () => {
      angle = (angle + 0.6) % 360;
      sweepRotationRef.current = angle;

      if (sweepRef.current) {
        sweepRef.current.style.transform = `rotate(${angle}deg)`;
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="radar-frame">
      <div className="radar-viewport">
        <div className="radar-map">
          <div className="radar-map-layer">
            <RadarMapSurface
              userLocation={userLocation}
              events={events}
              selectedEventId={selectedEventId}
              showLabels={showLabels}
              scanRadiusKm={scanRadiusKm}
              sweepRotationRef={sweepRotationRef}
              onMarkerClick={onMarkerClick}
            />
          </div>
        </div>
        <div ref={sweepRef} className="radar-sweep" />
      </div>
      <div className="outer-rim" />
      <div className="axis-x" />
      <div className="axis-y" />
      <div className="user-dot" />
    </div>
  );
});

export function RadarConsole() {
  const [geoState, setGeoState] = useState<GeoState>({ status: 'loading' });
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanRadiusKm, setScanRadiusKm] = useState<number>(DEFAULT_SCAN_RADIUS_KM);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState({ status: 'denied', lat: String(DEFAULT_HCMC.lat), lon: String(DEFAULT_HCMC.lon) });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState({
          status: 'ready',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setGeoState({ status: 'denied', lat: String(DEFAULT_HCMC.lat), lon: String(DEFAULT_HCMC.lon) });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }, []);

  const userLocation =
    geoState.status === 'ready'
      ? {
          lat: geoState.lat,
          lon: geoState.lon,
        }
      : null;

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  async function handleScan(radiusKm: 5 | 10) {
    if (geoState.status !== 'ready') {
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);

    try {
      const data = await scanArea(geoState.lat, geoState.lon, radiusKm);
      const nextEvents = data.events_json?.length ? data.events_json : data.events;
      setEvents(nextEvents);
      setSelectedEventId(nextEvents[0]?.id ?? null);
      setScanRadiusKm(radiusKm);
      setSheetOpen(nextEvents.length > 0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Scan request failed.');
    } finally {
      setIsScanning(false);
    }
  }

  function handleClear() {
    setEvents([]);
    setSelectedEventId(null);
    setSheetOpen(false);
    setErrorMessage(null);
  }

  function applyManualLocation() {
    if (geoState.status !== 'denied') {
      return;
    }

    const lat = Number(geoState.lat);
    const lon = Number(geoState.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setErrorMessage('Invalid latitude or longitude.');
      return;
    }

    setGeoState({ status: 'ready', lat, lon });
    setErrorMessage(null);
  }

  function useDefaultHcmc() {
    setGeoState({ status: 'ready', ...DEFAULT_HCMC });
    setErrorMessage(null);
  }

  return (
    <div className="relative flex min-h-screen flex-col gap-4">
      <div className="flex w-full flex-col gap-3 rounded-[24px] border border-[#00ff41] bg-black px-4 py-3 shadow-radar">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-[#00ff41]">GhostRadar PRO</p>
            <h1 className="mt-1 text-lg font-semibold text-[#00ff41] md:text-xl">Immersive radar</h1>
          </div>
          <div className="rounded-full border border-[#00ff41] bg-black px-3 py-1 text-[11px] text-[#00ff41]">
            {showLabels ? 'Labels on' : 'Labels off'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[#00ff41]">
          <span className="rounded-full border border-[#00ff41] bg-black px-3 py-1.5">
            {userLocation ? `Lat ${userLocation.lat.toFixed(4)} / Lon ${userLocation.lon.toFixed(4)}` : 'Location required'}
          </span>
          <span className="rounded-full border border-[#00ff41] bg-black px-3 py-1.5">{events.length} signals</span>
        </div>
      </div>

      {geoState.status === 'denied' ? (
        <div className="w-full rounded-[24px] border border-[#00ff41] bg-black p-4 shadow-radar">
          <p className="text-sm font-medium text-[#00ff41]">Location access denied</p>
          <p className="mt-2 text-sm text-[#00ff41]">
            Enter coordinates manually or use the default Ho Chi Minh City position.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <input
              value={geoState.lat}
              onChange={(event) => setGeoState({ ...geoState, lat: event.target.value })}
              placeholder="Latitude"
              className="min-h-12 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm text-[#00ff41] outline-none"
            />
            <input
              value={geoState.lon}
              onChange={(event) => setGeoState({ ...geoState, lon: event.target.value })}
              placeholder="Longitude"
              className="min-h-12 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm text-[#00ff41] outline-none"
            />
          </div>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={applyManualLocation}
              className="min-h-12 flex-1 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41]"
            >
              Apply coords
            </button>
            <button
              type="button"
              onClick={useDefaultHcmc}
              className="min-h-12 flex-1 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41]"
            >
              Use default HCMC
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="w-full rounded-2xl border border-[#00ff41] bg-black px-4 py-3 text-sm text-[#00ff41]">
          {errorMessage}
        </div>
      ) : null}

      <RadarScope
        userLocation={userLocation}
        events={events}
        selectedEventId={selectedEventId}
        showLabels={showLabels}
        scanRadiusKm={scanRadiusKm}
        onMarkerClick={(event) => {
          setSelectedEventId(event.id);
          setSheetOpen(true);
        }}
      />

      <div className="mt-auto pb-24">
        <ActionBar
          isScanning={isScanning}
          canScan={Boolean(userLocation)}
          showLabels={showLabels}
          onScan={handleScan}
          onToggleLabels={() => setShowLabels((value) => !value)}
          onClear={handleClear}
        />
      </div>

      <BottomSheet
        event={selectedEvent}
        isOpen={sheetOpen && Boolean(selectedEvent)}
        userLocation={userLocation}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

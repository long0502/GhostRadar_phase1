'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from '@/components/action-bar';
import { BottomSheet } from '@/components/bottom-sheet';
import { OSMMap } from '@/components/osm-map';
import { Radar } from '@/components/Radar';
import { scanArea } from '@/lib/api';
import type { RadarEvent } from '@/lib/types';
import { useRadarAudio } from '@/hooks/useRadarAudio';
import { useTranslation } from '@/i18n/useTranslation';
import { useLanguage } from '@/i18n/LanguageContext';
import { supportedLanguages, SupportedLanguage } from '@/i18n/config';

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

const DEFAULT_SCAN_RADIUS_KM = 5;

const RadarMapSurface = memo(function RadarMapSurface({
  userLocation,
  scanRadiusKm,
}: {
  userLocation: UserLocation | null;
  scanRadiusKm: number;
}) {
  if (!userLocation) {
    return <div className="h-full w-full bg-black" />;
  }

  return (
    <OSMMap
      lat={userLocation.lat}
      lon={userLocation.lon}
      radiusKm={scanRadiusKm}
    />
  );
});

const RadarScope = memo(function RadarScope({
  userLocation,
  events,
  showLabels,
  scanRadiusKm,
  rotation,
  onBlipClick,
}: {
  userLocation: UserLocation | null;
  events: RadarEvent[];
  showLabels: boolean;
  scanRadiusKm: number;
  rotation: number;
  onBlipClick: (eventId: string) => void;
}) {
  const sweepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sweepRef.current) {
      sweepRef.current.style.transform = `rotate(${rotation}deg)`;
    }
  }, [rotation]);

  return (
    <div className="radar-frame">
      <div className="radar-viewport">
        <div className="radar-map">
          <div className="radar-map-layer">
            <RadarMapSurface
              userLocation={userLocation}
              scanRadiusKm={scanRadiusKm}
            />
          </div>
        </div>
        <div className="radar-rings" aria-hidden="true">
          <div className="radar-ring radar-ring-30" />
          <div className="radar-ring radar-ring-60" />
          <div className="radar-ring radar-ring-90" />
        </div>
        <div ref={sweepRef} className="radar-sweep" />
        <Radar
          userLocation={userLocation}
          events={events}
          radiusKm={scanRadiusKm}
          rotation={rotation}
          showLabels={showLabels}
          onBlipClick={onBlipClick}
        />
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
  const [showLabels, setShowLabels] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanRadiusKm, setScanRadiusKm] = useState<number>(DEFAULT_SCAN_RADIUS_KM);
  const [rotation, setRotation] = useState(0);
  const [isTurbo, setIsTurbo] = useState(false);
  const sweepRotationRef = useRef(0);

  const { t } = useTranslation();
  const { language, setLanguage, showGeoSuggestion, dismissGeoSuggestion, acceptGeoSuggestion } = useLanguage();
  const lastScanLanguageRef = useRef(language);

  // Auto-rescan when language changes and events already exist
  useEffect(() => {
    if (lastScanLanguageRef.current === language) return; // no change
    const prevLang = lastScanLanguageRef.current;
    lastScanLanguageRef.current = language;

    // Only rescan if we already have events displayed or are currently scanning
    if ((events.length > 0 || isScanning) && geoState.status === 'ready') {
      console.log(`[RadarConsole] Language changed from ${prevLang} to ${language}. Refreshing scan...`);

      // Clear current UI state
      handleClear();

      // Trigger a new scan in the current language with CACHE BYPASS (force=true)
      handleScan(scanRadiusKm, true);
    }
  }, [language, scanRadiusKm, geoState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const { playSonar, isMuted, toggleMute } = useRadarAudio();
  const playSonarRef = useRef(playSonar);
  useEffect(() => { playSonarRef.current = playSonar; }, [playSonar]);

  const eventsRef = useRef(events);
  const radiusRef = useRef(scanRadiusKm);
  const isScanningRef = useRef(isScanning);
  useEffect(() => {
    eventsRef.current = events;
    radiusRef.current = scanRadiusKm;
    isScanningRef.current = isScanning;
  }, [events, scanRadiusKm, isScanning]);

  useEffect(() => {
    let frame: number;
    let angle = 0;

    const animate = () => {
      const speed = isScanningRef.current ? 2.0 : 0.75; // Slower normally, faster when scanning
      const nextAngle = (angle + speed) % 360;

      // Ping on sweep wrap
      if (nextAngle < angle) {
        const currentEvents = eventsRef.current;
        const radius = radiusRef.current;
        if (currentEvents.length > 0) {
          // Rough distance estimation for radar ping (first event)
          // For a true calculation we would use Haversine, but this is sufficient for audio UI
          const evt = currentEvents[0];
          // Instead of distanceKm we pass 0 assuming there is an event, or compute roughly
          // We don't have distanceKm natively mapped here without repeating haversine
          // Passing 0 triggers a sharp ping
          playSonarRef.current(0, radius);
        } else {
          playSonarRef.current(); // default calm ping
        }
      }

      angle = nextAngle;
      sweepRotationRef.current = angle;
      setRotation(angle);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

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

  async function handleScan(radiusKm: number, force: boolean = false) {
    if (geoState.status !== 'ready') {
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);

    const startTime = Date.now();

    try {
      const { data, cacheStatus } = await scanArea(geoState.lat, geoState.lon, radiusKm, language, force);
      const elapsed = Date.now() - startTime;
      console.log(`[RadarConsole] API Response received in ${elapsed}ms. Cache Status:`, cacheStatus);

      // Case-insensitive check for HIT or MISS
      const isCacheHit = cacheStatus?.toUpperCase() === 'HIT';

      // Fallback: If it's super fast (< 500ms), treat it as a cache hit for delay purposes
      const shouldDelay = isCacheHit || elapsed < 500;
      console.log('[RadarConsole] Should apply artificial delay?', shouldDelay, '(isCacheHit:', isCacheHit, 'fastResponse:', elapsed < 500, ')');

      if (shouldDelay) {
        const randomDelay = Math.floor(Math.random() * 2001) + 3000; // 3000ms to 5000ms
        console.log(`[RadarConsole] DELAY TRIGGERED: Target total time ${randomDelay}ms`);
        const remainingDelay = Math.max(0, randomDelay - elapsed);
        console.log(`[RadarConsole] Remaining wait time: ${remainingDelay}ms`);
        if (remainingDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingDelay));
        }
      } else {
        console.log('[RadarConsole] NO DELAY: response was slow enough or status is MISS');
      }

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
      {/* Geo Suggestion Banner */}
      {showGeoSuggestion && (
        <div className="mx-4 mt-4 flex items-center justify-between rounded-xl border border-[#00ff41] bg-black p-3 shadow-radar">
          <p className="text-sm font-medium text-[#00ff41]">{t('switchLanguage')}</p>
          <div className="flex gap-2">
            <button
              onClick={acceptGeoSuggestion}
              className="rounded-lg bg-[#00ff41] px-3 py-1 text-xs font-bold text-black"
            >
              Tiếng Việt
            </button>
            <button
              onClick={dismissGeoSuggestion}
              className="rounded-lg border border-[#00ff41] px-3 py-1 text-xs font-bold text-[#00ff41]"
            >
              x
            </button>
          </div>
        </div>
      )}

      <div className="flex w-full flex-col gap-3 rounded-[24px] border border-[#00ff41] bg-black px-4 py-3 shadow-radar">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-[#00ff41]">{t('ghostRadarPro')}</p>
            <h1 className="mt-1 text-lg font-semibold text-[#00ff41] md:text-xl">{t('radarTitle')}</h1>
          </div>
          {/* Language Switcher Dropdown */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            className="h-8 appearance-none rounded-full border border-[#00ff41] bg-black px-3 pr-6 text-xs font-bold text-[#00ff41] outline-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%2300ff41' d='M0 2l4 4 4-4z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[#00ff41]">
          <span className="rounded-full border border-[#00ff41] bg-black px-3 py-1.5">
            {userLocation ? `Lat ${userLocation.lat.toFixed(4)} / Lon ${userLocation.lon.toFixed(4)}` : t('locationRequired')}
          </span>
          <span className="rounded-full border border-[#00ff41] bg-black px-3 py-1.5">
            {t('signalAngle', { angle: Math.floor(rotation).toString().padStart(3, '0') })}
          </span>
          <span className="rounded-full border border-[#00ff41] bg-black px-3 py-1.5">
            {showLabels ? t('labelsOn') : t('labelsOff')}
          </span>
        </div>
      </div>

      {geoState.status === 'denied' ? (
        <div className="w-full rounded-[24px] border border-[#00ff41] bg-black p-4 shadow-radar">
          <p className="text-sm font-medium text-[#00ff41]">{t('locationDenied')}</p>
          <p className="mt-2 text-sm text-[#00ff41]">
            {t('locationDesc')}
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
              {t('applyCoords')}
            </button>
            <button
              type="button"
              onClick={useDefaultHcmc}
              className="min-h-12 flex-1 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41]"
            >
              {t('useDefaultHCMC')}
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
        showLabels={showLabels}
        scanRadiusKm={scanRadiusKm}
        rotation={rotation}
        onBlipClick={(eventId) => {
          setSelectedEventId(eventId);
          setSheetOpen(true);
        }}
      />

      <div className="mt-auto pb-24">
        <ActionBar
          isScanning={isScanning}
          canScan={Boolean(userLocation)}
          showLabels={showLabels}
          isTurbo={isTurbo}
          isMuted={isMuted}
          onScan={handleScan}
          onToggleLabels={() => setShowLabels((value) => !value)}
          onToggleTurbo={() => {
            const nextTurbo = !isTurbo;
            setIsTurbo(nextTurbo);
            handleScan(nextTurbo ? 10 : 5);
          }}
          onToggleMute={toggleMute}
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

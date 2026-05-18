'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from '@/components/action-bar';
import { SummaryPanel } from '@/components/SummaryPanel';
import { FullProfileModal } from '@/components/FullProfileModal';
import { LoadingProfile } from '@/components/LoadingProfile';
import { LocationPickerMap } from '@/components/location-picker-map-wrapper';
import { getProfileFromCache, saveProfileToCache, DetailedProfile } from '@/lib/profileCache';
import { OSMMap } from '@/components/osm-map';
import { Radar } from '@/components/Radar';
import { scanArea, expandEvent, clearRegistry, getQueueStatus } from '@/lib/api';
import type { QueueStatusResponse } from '@/lib/api';
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

type ManualCoords = {
  lat: string;
  lon: string;
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
          <svg width="0" height="0" className="absolute pointer-events-none">
            <defs>
              <filter id="radar-glow" x="-50%" y="-50%" width="200%" height="200%">
                {/* Wide soft bloom layer — creates the large diffuse neon halo */}
                <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="wideBlur" />
                <feColorMatrix in="wideBlur" type="matrix" result="brightBlur"
                  values="1.1 0 0 0 0
                          0 1.4 0 0 0.02
                          0 0 1.1 0 0
                          0 0 0 1.0 0" />
                {/* Tighter glow layer — retains the sweep edge sharpness */}
                <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="tightBlur" />
                <feMerge>
                  <feMergeNode in="brightBlur" />
                  <feMergeNode in="tightBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </svg>
          <div className="radar-ring radar-ring-30" />
          <div className="radar-ring radar-ring-60" />
          <div className="radar-ring radar-ring-90" />
        </div>
        <div ref={sweepRef} className="radar-sweep" style={{ filter: 'url(#radar-glow)' }} />
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
  const [manualCoords, setManualCoords] = useState<ManualCoords>({
    lat: String(DEFAULT_HCMC.lat),
    lon: String(DEFAULT_HCMC.lon),
  });
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<DetailedProfile | null>(null);
  const [scanRadiusKm, setScanRadiusKm] = useState<number>(DEFAULT_SCAN_RADIUS_KM);
  const [rotation, setRotation] = useState(0);
  const [isTurbo, setIsTurbo] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [clearStatus, setClearStatus] = useState<string | null>(null);
  const [queueInfo, setQueueInfo] = useState<QueueStatusResponse | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const sweepRotationRef = useRef(0);

  const { t } = useTranslation();
  const { language, setLanguage, showGeoSuggestion, dismissGeoSuggestion, acceptGeoSuggestion } = useLanguage();
  const lastScanLanguageRef = useRef(language);
  const mapPickHint = language === 'vi' ? 'Bấm trực tiếp trên bản đồ để chọn tọa độ.' : t('mapPickHint');

  // Auto-rescan when language changes and events already exist
  useEffect(() => {
    if (lastScanLanguageRef.current === language) return; // no change
    const prevLang = lastScanLanguageRef.current;
    lastScanLanguageRef.current = language;

    // Only rescan if we already have events displayed or are currently scanning
    if ((events.length > 0 || isScanning) && geoState.status === 'ready') {
      console.log(`[RadarConsole] Language changed from ${prevLang} to ${language}. Refreshing scan...`);

      // Clear current UI state without wiping database registry (which causes race conditions with handleScan)
      setEvents([]);
      setSelectedEventId(null);
      setSummaryOpen(false);
      setModalOpen(false);
      setErrorMessage(null);

      // Trigger a new scan in the current language with CACHE BYPASS (force=true)
      handleScan(scanRadiusKm, true);
    }
  }, [language, scanRadiusKm, geoState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll queue status while scanning or loading profile
  useEffect(() => {
    if (!isScanning && !isLoadingProfile) {
      setQueueInfo(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const status = await getQueueStatus();
          if (!cancelled) setQueueInfo(status);
        } catch {
          // ignore polling errors
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [isScanning, isLoadingProfile]);

  const { playSonar, isMuted, toggleMute } = useRadarAudio();
  const playSonarRef = useRef(playSonar);
  useEffect(() => { playSonarRef.current = playSonar; }, [playSonar]);

  const eventsRef = useRef(events);
  const radiusRef = useRef(scanRadiusKm);
  const isScanningRef = useRef(isScanning);
  const lastAppliedLocationRef = useRef<{ lat: number; lon: number } | null>(null);
  const scanInFlightRef = useRef(false);
  const scanRunIdRef = useRef(0);
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
      lastAppliedLocationRef.current = { lat: DEFAULT_HCMC.lat, lon: DEFAULT_HCMC.lon };
      setGeoState({ status: 'denied', lat: String(DEFAULT_HCMC.lat), lon: String(DEFAULT_HCMC.lon) });
      setManualCoords({
        lat: String(DEFAULT_HCMC.lat),
        lon: String(DEFAULT_HCMC.lon),
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude;
        const nextLon = position.coords.longitude;
        lastAppliedLocationRef.current = { lat: nextLat, lon: nextLon };
        setGeoState({
          status: 'ready',
          lat: nextLat,
          lon: nextLon,
        });
        setManualCoords({
          lat: nextLat.toFixed(6),
          lon: nextLon.toFixed(6),
        });
      },
      () => {
        lastAppliedLocationRef.current = { lat: DEFAULT_HCMC.lat, lon: DEFAULT_HCMC.lon };
        setGeoState({ status: 'denied', lat: String(DEFAULT_HCMC.lat), lon: String(DEFAULT_HCMC.lon) });
        setManualCoords({
          lat: String(DEFAULT_HCMC.lat),
          lon: String(DEFAULT_HCMC.lon),
        });
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
  const showLocationPicker = geoState.status === 'denied' || locationPickerOpen;

  const pickerCoordinates = useMemo<[number, number]>(() => {
    const lat = Number(manualCoords.lat);
    const lon = Number(manualCoords.lon);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return [lat, lon];
    }

    if (geoState.status === 'ready') {
      return [geoState.lat, geoState.lon];
    }

    return [DEFAULT_HCMC.lat, DEFAULT_HCMC.lon];
  }, [manualCoords.lat, manualCoords.lon, geoState]);

  async function handleScan(radiusKm: number, force: boolean = false) {
    const manualLat = Number(manualCoords.lat);
    const manualLon = Number(manualCoords.lon);
    const hasValidManualLocation =
      Number.isFinite(manualLat) &&
      Number.isFinite(manualLon) &&
      manualLat >= -90 &&
      manualLat <= 90 &&
      manualLon >= -180 &&
      manualLon <= 180;

    const scanCenter =
      hasValidManualLocation
        ? { lat: manualLat, lon: manualLon }
        : geoState.status === 'ready'
          ? { lat: geoState.lat, lon: geoState.lon }
          : lastAppliedLocationRef.current;

    if (!scanCenter) {
      return;
    }

    if (scanInFlightRef.current) {
      return;
    }

    const scanRunId = ++scanRunIdRef.current;
    scanInFlightRef.current = true;

    setIsScanning(true);
    setErrorMessage(null);
    setSummaryOpen(false);
    setModalOpen(false);
    setSelectedEventId(null);
    setCurrentProfile(null);
    setEvents([]);
    lastAppliedLocationRef.current = { lat: scanCenter.lat, lon: scanCenter.lon };

    const startTime = Date.now();
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), 65000);

    try {
      const { data, cacheStatus } = await scanArea(
        scanCenter.lat,
        scanCenter.lon,
        radiusKm,
        language,
        force || forceRefresh,
        abortController.signal
      );
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

      if (scanRunId !== scanRunIdRef.current) {
        return;
      }

      const nextEvents = data.events_json?.length ? data.events_json : data.events;
      setEvents(nextEvents);
      // We no longer auto-select or auto-open
      // setSelectedEventId(nextEvents[0]?.id ?? null);
      // setSummaryOpen(nextEvents.length > 0);
      setScanRadiusKm(radiusKm);
      setForceRefresh(false);
    } catch (error) {
      if (scanRunId !== scanRunIdRef.current) {
        return;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        setErrorMessage('Làn quét kéo dài bất thường nên đã được ngắt để ổn định hệ thống. Hãy quét lại.');
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Làn quét vừa tắt lịm trước khi chạm được tín hiệu. Hãy thử lại.');
    } finally {
      window.clearTimeout(timeoutId);
      if (scanRunId === scanRunIdRef.current) {
        setIsScanning(false);
      }
      scanInFlightRef.current = false;
    }
  }

  const handleBlipClick = useCallback((eventId: string) => {
    if (isScanningRef.current || isLoadingProfile || modalOpen) {
      return;
    }
    setSelectedEventId(eventId);
    setSummaryOpen(true);
  }, [isLoadingProfile, modalOpen]);

  async function handleClear() {
    setEvents([]);
    setSelectedEventId(null);
    setSummaryOpen(false);
    setModalOpen(false);
    setErrorMessage(null);
    setForceRefresh(true);
    
    try {
      await clearRegistry();
      setClearStatus('NGHI THỨC THANH TẨY ĐÃ HOÀN TẤT');
      setTimeout(() => setClearStatus(null), 3000);
    } catch (err) {
      console.error('Failed to clear registry', err);
      setErrorMessage('Không thể khép vòng nghi thức xóa ký ức. Kiểm tra nhật ký máy chủ.');
    }
  }

  function applyManualLocation() {
    const lat = Number(manualCoords.lat);
    const lon = Number(manualCoords.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setErrorMessage('Tọa độ bị nhiễu, nghi thức định vị không thể khóa tâm quét.');
      return;
    }

    setGeoState({ status: 'ready', lat, lon });
    lastAppliedLocationRef.current = { lat, lon };
    setManualCoords({
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
    });
    setErrorMessage(null);
    setLocationPickerOpen(false);
  }

  function useDefaultHcmc() {
    setGeoState({ status: 'ready', ...DEFAULT_HCMC });
    lastAppliedLocationRef.current = { lat: DEFAULT_HCMC.lat, lon: DEFAULT_HCMC.lon };
    setManualCoords({
      lat: String(DEFAULT_HCMC.lat),
      lon: String(DEFAULT_HCMC.lon),
    });
    setErrorMessage(null);
    setLocationPickerOpen(false);
  }

  function openLocationPicker() {
    if (geoState.status === 'ready') {
      setManualCoords({
        lat: geoState.lat.toFixed(6),
        lon: geoState.lon.toFixed(6),
      });
    } else if (geoState.status === 'denied') {
      setManualCoords({
        lat: geoState.lat,
        lon: geoState.lon,
      });
    }
    setLocationPickerOpen((value) => !value);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setErrorMessage('Thiết bị này chưa mở được la bàn định vị cho nghi thức quét.');
      return;
    }

    setErrorMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude;
        const nextLon = position.coords.longitude;
        lastAppliedLocationRef.current = { lat: nextLat, lon: nextLon };
        setGeoState({
          status: 'ready',
          lat: nextLat,
          lon: nextLon,
        });
        setManualCoords({
          lat: nextLat.toFixed(6),
          lon: nextLon.toFixed(6),
        });
        setLocationPickerOpen(false);
      },
      () => {
        setErrorMessage('Không gọi được vị trí hiện tại. Làn sương định vị đang quá dày.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }

  function handleMapLocationSelect(lat: number, lon: number) {
    setManualCoords({
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
    });
    lastAppliedLocationRef.current = { lat, lon };
    setGeoState({ status: 'ready', lat, lon });
    setErrorMessage(null);
  }

  /**
   * Cleans text and handles robust extraction if the string contains JSON.
   * If a JSON block is found, it attempts to parse and extract the preferred key.
   * As a fallback, it uses a quote-based heuristic (extracting text between 3rd and 4th quote).
   */
  function cleanSectionText(value: any, preferredKey?: string): string {
    if (!value || typeof value !== 'string') return '';
    
    let text = value.trim();
    
    // Try to find a JSON block anywhere in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        // AI sometimes puts literal newlines inside JSON strings, which is invalid JSON.
        // We try to escape them for parsing.
        const potentialJson = jsonMatch[0].replace(/\n/g, '\\n');
        const parsed = JSON.parse(potentialJson);
        
        if (typeof parsed === 'object' && parsed !== null) {
          // If we have a preferred key and it exists in the object
          if (preferredKey && parsed[preferredKey]) {
            return String(parsed[preferredKey]).trim();
          }
          
          // Fallback: look for common content keys
          const commonKeys = ['story_text', 'witness', 'analysis', 'legend_overview', 'visitor_reports', 'history', 'local_stories'];
          for (const k of commonKeys) {
            if (parsed[k]) return String(parsed[k]).trim();
          }

          // Last resort: find the longest string value
          const values = Object.values(parsed).filter(v => typeof v === 'string');
          if (values.length > 0) {
            return (values.sort((a, b) => (b as string).length - (a as string).length)[0] as string).trim();
          }
        }
      } catch {
        // Parsing failed. Apply the user's "3rd and 4th quote" heuristic.
        // In a JSON string like "key": "value", the 3rd and 4th quotes enclose the value.
        const quoteMatches = text.match(/"([^"]*)"/g);
        if (quoteMatches && quoteMatches.length >= 2) {
          // The 2nd match corresponds to the content between the 3rd and 4th double quotes
          return quoteMatches[1].replace(/^"|"$/g, '').trim();
        }
      }
    }

    return text
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();
  }

  const handleExploreProfile = useCallback(async () => {
    if (!selectedEvent) return;

    const cached = getProfileFromCache(selectedEvent.id, language);
    if (cached) {
      setCurrentProfile(cached);
      setModalOpen(true);
      return;
    }

    setIsLoadingProfile(true);

    try {
      // Parallel simulated loading wait and API call
      const randomDelayMs = Math.floor(Math.random() * (6000 - 3000 + 1) + 3000);
      const startTime = Date.now();

      const [apiResponse] = await Promise.all([
        expandEvent(selectedEvent.id, language),
        new Promise((resolve) => setTimeout(resolve, randomDelayMs))
      ]);

      const detailJson = apiResponse.detail;
      const sections = {
        story_text: cleanSectionText(apiResponse.story_text || detailJson?.legend_overview, 'story_text'),
        witness: cleanSectionText(apiResponse.witness, 'witness'),
        analysis: cleanSectionText(apiResponse.analysis || detailJson?.spectral_analysis, 'analysis'),
        legend_overview: detailJson?.legend_overview || '',
        chronological_history: detailJson?.chronological_history || '',
        witnesses: detailJson?.witnesses || [],
        spectral_analysis: detailJson?.spectral_analysis || '',
        risk_assessment: detailJson?.risk_assessment || '',
        image_url: detailJson?.image_url || '',
      };

      const profile: DetailedProfile = {
        location_id: selectedEvent.id,
        language: language,
        timestamp: Date.now(),
        sections,
      };

      saveProfileToCache(profile);
      setCurrentProfile(profile);
      setModalOpen(true);
    } catch (error) {
      console.error('Failed to expand profile', error);
      let msg = error instanceof Error ? error.message : 'Không thể mở rộng hồ sơ. Tín hiệu vừa chìm xuống tầng nhiễu.';
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error && parsed.error.message) msg = parsed.error.message;
      } catch {
        // Not JSON, keep original msg
      }
      setErrorMessage(msg);
      setSummaryOpen(false);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [selectedEvent, language]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col gap-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]">
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

      {showLocationPicker ? (
        <div className="fixed inset-0 z-[140] overflow-y-auto bg-black/92 backdrop-blur-md">
          <div className="mx-auto flex min-h-[100dvh] w-full max-w-[720px] flex-col px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
            <div className="mx-auto mb-3 mt-1 h-1.5 w-14 rounded-full bg-[#00ff41]/35" />
            <div className="w-full rounded-[24px] border border-[#00ff41] bg-black p-4 shadow-radar">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#00ff41]">
                    {geoState.status === 'denied' ? t('locationDenied') : t('selectLocation')}
                  </p>
                  <p className="mt-2 text-sm text-[#00ff41]">
                    {t('locationDesc')}
                  </p>
                  <p className="mt-2 text-xs text-[#00ff41]/80">
                    {mapPickHint}
                  </p>
                </div>
                {locationPickerOpen && geoState.status !== 'denied' ? (
                  <button
                    type="button"
                    onClick={() => setLocationPickerOpen(false)}
                    className="min-h-11 min-w-11 rounded-full border border-[#00ff41]/50 px-3 text-xs font-medium text-[#00ff41]/80"
                  >
                    {t('close')}
                  </button>
                ) : null}
              </div>
              <div className="mt-4 h-[min(38dvh,18rem)] w-full overflow-hidden rounded-2xl sm:h-72 md:h-[min(42vh,18rem)]">
                <LocationPickerMap
                  center={pickerCoordinates}
                  selected={pickerCoordinates}
                  onSelect={handleMapLocationSelect}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={manualCoords.lat}
                  onChange={(event) => setManualCoords((current) => ({ ...current, lat: event.target.value }))}
                  placeholder="Latitude"
                  inputMode="decimal"
                  className="min-h-12 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm text-[#00ff41] outline-none"
                />
                <input
                  value={manualCoords.lon}
                  onChange={(event) => setManualCoords((current) => ({ ...current, lon: event.target.value }))}
                  placeholder="Longitude"
                  inputMode="decimal"
                  className="min-h-12 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm text-[#00ff41] outline-none"
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={applyManualLocation}
                  className="min-h-12 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41]"
                >
                  {t('applyCoords')}
                </button>
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  className="min-h-12 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41]"
                >
                  {t('useCurrentLocation')}
                </button>
                <button
                  type="button"
                  onClick={useDefaultHcmc}
                  className="min-h-12 rounded-2xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41]"
                >
                  {t('useDefaultHCMC')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="w-full rounded-2xl border border-[#00ff41] bg-black px-4 py-3 text-sm text-[#00ff41]">
          {errorMessage}
        </div>
      ) : null}

      {(isScanning || isLoadingProfile) && queueInfo && queueInfo.queueLength > 0 ? (
        <div className="w-full rounded-2xl border border-yellow-500/60 bg-black px-4 py-3 text-sm text-yellow-400 font-mono animate-pulse">
          <span className="inline-block mr-2">⏳</span>
          TẦNG TRIỆU HỒI ĐANG ĐÔNG: {queueInfo.queueLength} tín hiệu chờ mở cổng
          {queueInfo.estimatedWaitSec > 0 ? ` — ~${queueInfo.estimatedWaitSec}s` : ''}
          <span className="block text-[10px] text-yellow-500/60 mt-1">NHỊP TRIỆU HỒI: {queueInfo.rpmUsed}/{queueInfo.rpmLimit}</span>
        </div>
      ) : null}

      {clearStatus ? (
        <div className="w-full rounded-2xl border border-[#00ff41] bg-black px-4 py-3 text-sm text-center font-bold text-[#00ff41] animate-pulse">
           &gt;&gt; {clearStatus} &lt;&lt;
        </div>
      ) : null}

      <RadarScope
        userLocation={userLocation}
        events={events}
        showLabels={showLabels}
        scanRadiusKm={scanRadiusKm}
        rotation={rotation}
        onBlipClick={handleBlipClick}
      />

      <div className="sticky bottom-0 z-20 -mx-2 mt-auto bg-gradient-to-t from-black via-black/92 to-transparent px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-6 sm:-mx-4 sm:px-4">
        <ActionBar
          isScanning={isScanning}
          canScan={Boolean(userLocation)}
          showLabels={showLabels}
          isTurbo={isTurbo}
          isMuted={isMuted}
          onScan={handleScan}
          onChooseLocation={openLocationPicker}
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

      <SummaryPanel
        event={selectedEvent}
        isOpen={summaryOpen && Boolean(selectedEvent) && !modalOpen}
        userLocation={userLocation}
        onExploreClick={handleExploreProfile}
        onClose={() => setSummaryOpen(false)}
      />

      <FullProfileModal
        profile={currentProfile}
        event={selectedEvent}
        isOpen={modalOpen}
        userLocation={userLocation}
        onClose={() => { setModalOpen(false); setSummaryOpen(false); setSelectedEventId(null); }}
      />

      {isLoadingProfile && <LoadingProfile queueLength={queueInfo?.queueLength} estimatedWaitSec={queueInfo?.estimatedWaitSec} />}
    </div>
  );
}

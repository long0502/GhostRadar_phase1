'use client';

import { useState } from 'react';
import { expandEvent } from '@/lib/api';
import { formatDistanceKm } from '@/lib/geo';
import type { EventDetail, RadarEvent } from '@/lib/types';

type BottomSheetProps = {
  event: RadarEvent | null;
  isOpen: boolean;
  userLocation: { lat: number; lon: number } | null;
  desktop?: boolean;
  onClose: () => void;
};

function eventSummary(event: RadarEvent | null): string {
  if (!event) {
    return 'Tap a marker to inspect the event.';
  }

  return event.teaser ?? event.summary ?? 'No summary available.';
}

function detailText(detail: EventDetail | null): string {
  if (!detail) {
    return '';
  }

  return detail.story_text ?? detail.detail?.story_text ?? 'No dossier content available.';
}

export function BottomSheet({ event, isOpen, userLocation, desktop = false, onClose }: BottomSheetProps) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleExpand() {
    if (!event) {
      return;
    }

    console.log('Before API call /expand', { eventId: event.id });
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await expandEvent(event.id);
      console.log('After API call /expand', { eventId: event.id, detailId: response.id });
      setDetail(response);
    } catch (error) {
      console.error('Expand API error', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load dossier.');
    } finally {
      setIsLoading(false);
    }
  }

  const containerClass = desktop
    ? 'hidden h-full rounded-[28px] border border-[#00ff41] bg-black p-5 shadow-radar lg:flex lg:flex-col'
    : `fixed inset-x-0 bottom-0 z-[500] rounded-t-[28px] border border-[#00ff41] bg-black p-4 pb-6 shadow-radar transition-transform duration-300 md:hidden ${
        isOpen ? 'translate-y-0' : 'translate-y-[105%]'
      }`;

  return (
    <div className={containerClass}>
      {!desktop ? <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[#00ff41]" /> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.3em] text-[#00ff41]">Signal dossier</p>
          <h2 className="mt-2 truncate text-xl font-semibold text-[#00ff41]">{event?.title ?? 'No signal selected'}</h2>
          <p className="mt-1 text-sm text-[#00ff41]">{event?.type ?? 'Unclassified'}</p>
        </div>
        {!desktop ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#00ff41] bg-black px-3 py-1 text-xs text-[#00ff41]"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#00ff41]">
        <span className="rounded-full border border-[#00ff41] bg-black px-3 py-1">
          {event && userLocation
            ? formatDistanceKm(userLocation.lat, userLocation.lon, event.lat, event.lon)
            : 'Distance unavailable'}
        </span>
        <span className="rounded-full border border-[#00ff41] bg-black px-3 py-1">
          Severity {event?.danger_level ?? event?.severity ?? '-'}
        </span>
      </div>

      <div className="mt-4 overflow-auto">
        {detail ? (
          <div className="whitespace-pre-wrap text-sm leading-6 text-[#00ff41]">{detailText(detail)}</div>
        ) : (
          <p className="text-sm leading-6 text-[#00ff41]">{eventSummary(event)}</p>
        )}
        {errorMessage ? <p className="mt-3 text-sm text-[#00ff41]">{errorMessage}</p> : null}
      </div>

      <button
        type="button"
        disabled={!event || isLoading}
        onClick={handleExpand}
        className="mt-5 min-h-12 w-full rounded-2xl border border-[#00ff41] bg-black px-4 text-sm font-medium text-[#00ff41] transition disabled:opacity-50"
      >
        {isLoading ? 'Dang khai thac...' : detail ? 'Tai lai ho so' : 'Khai thac ho so'}
      </button>
    </div>
  );
}

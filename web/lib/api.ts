import type { EventDetail, ScanResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8088';

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function scanArea(
  lat: number,
  lon: number,
  radiusKm: number,
  lang: string = 'en',
  force: boolean = false
): Promise<{ data: ScanResponse; cacheStatus: string | null }> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radiusKm: String(radiusKm),
    lang: lang,
  });

  if (force) {
    params.append('force', 'true');
  }

  const response = await fetch(`${API_BASE_URL}/scan?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const headerEntries = Array.from(response.headers.entries());
  console.log('[API] All Headers received:', headerEntries);

  const cacheStatus = response.headers.get('X-Cache') || response.headers.get('x-cache');
  console.log('[API] Detected X-Cache:', cacheStatus);
  const data = await parseJson<ScanResponse>(response);

  return { data, cacheStatus };
}

export async function expandEvent(eventId: string, lang: string = 'en'): Promise<EventDetail> {
  const params = new URLSearchParams({
    level: '1',
    lang: lang,
  });

  const response = await fetch(`${API_BASE_URL}/events/${eventId}/expand?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  return parseJson<EventDetail>(response);
}

export async function clearRegistry(): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/grid-cache/clear`, {
    method: 'DELETE',
  });
  return parseJson<{ success: boolean; message: string }>(response);
}

export type QueueStatusResponse = {
  queueLength: number;
  estimatedWaitSec: number;
  rpmLimit: number;
  rpmUsed: number;
};

export async function getQueueStatus(): Promise<QueueStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/queue-status`);
  return parseJson<QueueStatusResponse>(response);
}

export type GenerateImageResponse = {
  image_url: string;
  cached?: boolean;
  error?: string;
};

export async function generateEventImage(eventId: string): Promise<GenerateImageResponse> {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/generate-image`, {
    method: 'POST',
  });
  return parseJson<GenerateImageResponse>(response);
}

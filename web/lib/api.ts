import type { EventDetail, ScanResponse } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8088';

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function scanArea(lat: number, lon: number, radiusKm: number): Promise<ScanResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radiusKm: String(radiusKm)
  });

  const response = await fetch(`${API_BASE_URL}/scan?${params.toString()}`, {
    method: 'POST'
  });

  return parseJson<ScanResponse>(response);
}

export async function expandEvent(eventId: string): Promise<EventDetail> {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/expand?level=1`, {
    method: 'POST'
  });

  return parseJson<EventDetail>(response);
}

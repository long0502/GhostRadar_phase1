import { createHash } from 'crypto';

export function computeGridId(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

export function computeScanGridId(lat: number, lon: number, radiusKm: number, targetLanguage: string = 'en'): string {
  const roundedLat = lat.toFixed(2);
  const roundedLon = lon.toFixed(2);
  const roundedRadius = radiusKm.toFixed(2);
  const base = `${roundedLat}:${roundedLon}:${roundedRadius}:${targetLanguage}`;
  return createHash('sha256').update(base).digest('hex').slice(0, 20);
}

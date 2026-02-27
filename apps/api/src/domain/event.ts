import { randomUUID } from 'crypto';

export type ScanEvent = {
  id: string;
  title: string;
  lat: number;
  lon: number;
  summary: string;
  created_at: string;
};

export function buildStubEvents(lat: number, lon: number, gridId: string): ScanEvent[] {
  return Array.from({ length: 5 }, () => {
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lonOffset = (Math.random() - 0.5) * 0.01;
    return {
      id: randomUUID(),
      title: `Incident near ${gridId}`,
      lat: Number((lat + latOffset).toFixed(6)),
      lon: Number((lon + lonOffset).toFixed(6)),
      summary: 'Stub event for Phase 1',
      created_at: new Date().toISOString(),
    };
  });
}

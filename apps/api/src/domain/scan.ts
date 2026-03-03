import type { FastifyBaseLogger } from 'fastify';
import type { ScanEvent } from './event';

export type ScanInput = {
  lat: number;
  lon: number;
  radiusKm: number;
  logger?: FastifyBaseLogger;
  requestId?: string;
  beforeAiCall?: () => Promise<
    | void
    | {
        usageDate: string;
        clientIp: string;
      }
  >;
};

export type ScanResponse = {
  grid_id: string;
  events: ScanEvent[] | unknown[];
  events_json: ScanEvent[] | unknown[];
};

export type ScanCacheStatus = 'HIT' | 'MISS';

export type ScanServiceResult = {
  cacheStatus: ScanCacheStatus;
  response: ScanResponse;
};

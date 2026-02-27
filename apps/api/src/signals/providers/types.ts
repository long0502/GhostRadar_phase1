export type RawSignal = {
  source: string;
  fetchKey: string;
  rawPayload: any;
};

export interface RawSignalProvider {
  fetch(params: {
    lat: number;
    lon: number;
    radiusKm: number;
    gridId: string;
  }): Promise<RawSignal[]>;
}

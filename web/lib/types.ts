export type RadarEvent = {
  id: string;
  title?: string;
  type?: string;
  lat: number;
  lon: number;
  teaser?: string;
  summary?: string;
  danger_level?: number;
  severity?: number;
  grid_id?: string;
  created_at?: string;
};

export type ScanResponse = {
  grid_id: string;
  events: RadarEvent[];
  events_json: RadarEvent[];
};

export type EventDetail = {
  id: string;
  event_id?: string;
  level?: number;
  story_text?: string;
  witness?: string;
  analysis?: string;
  generated_at?: string;
  detail?: {
    level?: number;
    story_text?: string;
    witness?: string;
    analysis?: string;
  };
};

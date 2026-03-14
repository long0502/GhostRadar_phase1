export type RadarEvent = {
  id: string;
  title?: string;
  localizedTitle?: string;
  type?: string;
  lat: number;
  lon: number;
  teaser?: string;
  summary?: string;
  danger_level?: number;
  severity?: number;
  grid_id?: string;
  created_at?: string;
  signal_strength?: 'Low' | 'Medium' | 'High' | 'Critical';
  legend_type?: string;
  tagline?: string;
  last_seen?: string;
  danger_level_text?: string;
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
  generated_at?: string;
  story_text?: string;
  witness?: string;
  analysis?: string;
  detail?: {
    legend_overview?: string;
    chronological_history?: string;
    witnesses?: Array<{ name: string; testimony: string; date: string }>;
    spectral_analysis?: string;
    risk_assessment?: string;
    image_prompt?: string;
    image_url?: string;
  };
};

export interface DetailedProfile {
  location_id: string;
  language: string;
  timestamp: number; // For 48h cache expiry
  sections: {
    story_text: string;
    witness: string;
    analysis: string;
    legend_overview?: string;
    chronological_history?: string;
    witnesses?: Array<{ name: string; testimony: string; date: string }>;
    spectral_analysis?: string;
    risk_assessment?: string;
    image_url?: string;
  };
}

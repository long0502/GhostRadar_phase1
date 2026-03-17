-- usage_logs: per-request analytics for scans and expands
CREATE TABLE usage_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  action          TEXT NOT NULL,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION,
  radius_km       DOUBLE PRECISION,
  lang            TEXT,
  grid_id         TEXT,
  event_id        TEXT,
  user_id         TEXT,
  ip              TEXT,
  cache_hit       BOOLEAN NOT NULL DEFAULT false,
  ai_called       BOOLEAN NOT NULL DEFAULT false,
  events_returned INT NOT NULL DEFAULT 0,
  response_ms     INT NOT NULL DEFAULT 0,
  error           TEXT
);

CREATE INDEX idx_usage_logs_timestamp ON usage_logs ("timestamp");
CREATE INDEX idx_usage_logs_action    ON usage_logs (action);
CREATE INDEX idx_usage_logs_grid_id   ON usage_logs (grid_id);
CREATE INDEX idx_usage_logs_ip        ON usage_logs (ip);

-- ai_call_logs: per-AI-call telemetry
CREATE TABLE ai_call_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  endpoint        TEXT NOT NULL,
  model           TEXT NOT NULL,
  tokens_input    INT DEFAULT 0,
  tokens_output   INT DEFAULT 0,
  estimated_cost  DOUBLE PRECISION DEFAULT 0,
  event_id        TEXT,
  latency_ms      INT NOT NULL DEFAULT 0,
  success         BOOLEAN NOT NULL DEFAULT true,
  error_message   TEXT
);

CREATE INDEX idx_ai_call_logs_timestamp ON ai_call_logs ("timestamp");
CREATE INDEX idx_ai_call_logs_endpoint  ON ai_call_logs (endpoint);
CREATE INDEX idx_ai_call_logs_model     ON ai_call_logs (model);

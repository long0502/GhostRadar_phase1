CREATE TABLE IF NOT EXISTS ai_quota_policy (
  scope TEXT PRIMARY KEY,
  daily_limit INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  scope TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  usage_date DATE NOT NULL,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  scan_calls INTEGER NOT NULL DEFAULT 0,
  expand_calls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_key, usage_date)
);

INSERT INTO ai_quota_policy (scope, daily_limit)
VALUES
  ('global', 2000),
  ('ip', 20)
ON CONFLICT (scope) DO UPDATE
SET daily_limit = EXCLUDED.daily_limit,
    updated_at = now();

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_usage_date
  ON ai_usage_daily (usage_date);

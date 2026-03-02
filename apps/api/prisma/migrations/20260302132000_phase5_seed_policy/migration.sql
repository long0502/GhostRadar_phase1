INSERT INTO ai_quota_policy (scope, daily_limit)
VALUES
  ('global', 2000),
  ('ip', 20)
ON CONFLICT (scope) DO NOTHING;

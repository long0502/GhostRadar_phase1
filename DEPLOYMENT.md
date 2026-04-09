# GhostRadar Deployment Runbook

This document is the practical runbook for moving a verified local build to the VPS with the least amount of manual drift.

## 1. Architecture

- `apps/api`: Fastify API + Prisma + Postgres access
- `apps/admin`: internal admin dashboard
- `web`: public Next.js frontend
- External dependency: `AI_GATEWAY_URL`

Runtime shape in production:

1. User opens `web`
2. `web` calls `api`
3. `api` calls external AI gateway with async polling
4. `api` stores cache, events, details, usage logs, and AI logs in Postgres
5. `admin` reads the same database directly

## 2. Important Data Flows

### Main user flow

1. `POST /scan`
2. API validates input, computes `grid_id`, checks `grid_cache`
3. On cache miss, API submits a prompt to `AI_GATEWAY_URL/ask`
4. API polls `AI_GATEWAY_URL/jobs/{request_id}` until `success` or `error`
5. API stores generated events in `events` and cache metadata in `grid_cache`
6. Web renders radar blips
7. User clicks a blip and calls `POST /events/:id/expand?level=1`
8. API generates and stores dossier detail in `event_details`

### Raw signal pipeline

This is present in the repo but is not the current user-facing scan path.

1. A provider such as `rss.provider.ts` fetches raw external content
2. Raw items are inserted into `raw_signal`
3. `normalizeWithGemini()` transforms raw items into a stricter structure
4. Normalized rows are stored in `normalized_signal`
5. Deduplication is done via `signal_hash`

Purpose:

- prepare a future "real data foundation" layer
- support ingestion experiments without touching the user-facing scan flow

Current status:

- useful for batch/offline pipelines
- not currently wired into `POST /scan`

## 3. Local Verification Before Deploy

Always verify locally first.

### Required local env

`apps/api/.env`

```env
DATABASE_URL=postgresql://ghostradar:ghostradar@127.0.0.1:5433/ghostradar
PORT=8088
AI_GATEWAY_URL=http://your-gateway-host
AI_POLL_TIMEOUT_MS=180000
AI_POLL_INTERVAL_MS=3000
```

`apps/admin/.env`

```env
DATABASE_URL=postgresql://ghostradar:ghostradar@127.0.0.1:5433/ghostradar
JWT_SECRET=change-me
ADMIN_PORT=4000
```

### Boot local

From repo root:

```powershell
npm run start:dev
```

This starts:

- Postgres on `5433`
- API on `8088`
- Web on `3000`
- Admin on `4000`

### Minimum smoke checklist

1. API health:

```powershell
Invoke-WebRequest http://127.0.0.1:8088/health
Invoke-WebRequest http://127.0.0.1:8088/ready
Invoke-WebRequest http://127.0.0.1:8088/internal/ai-health
```

2. Real scan:

```powershell
Invoke-WebRequest -Method Post `
  -ContentType 'application/json' `
  -Body '{}' `
  'http://127.0.0.1:8088/scan?lat=10.7769&lon=106.7009&radiusKm=5&lang=vi&force=true'
```

Expected:

- HTTP 200
- non-empty `events` / `events_json`

3. Expand one returned event:

```powershell
Invoke-WebRequest -Method Post `
  -ContentType 'application/json' `
  -Body '{}' `
  'http://127.0.0.1:8088/events/<event-id>/expand?level=1&lang=vi'
```

Expected:

- HTTP 200
- `detail.legend_overview`, `detail.witnesses`, `detail.spectral_analysis`

4. Frontend smoke:

```powershell
cd web
npm run test:ui
```

5. Production builds:

```powershell
cd apps/api; npm run build
cd ../../web; npm run build
cd ../apps/admin; npm run build
```

Do not deploy if any step above fails.

## 4. VPS Prerequisites

Prepare these once on the VPS:

- backend directory, default: `/app/ghostradar`
- web directory, default: `/app/ghostradar_web`
- Docker + Compose installed
- persistent `.env` in both directories

### Backend `.env` example on VPS

```env
DB_USER=ghostradar
DB_PASSWORD=change-me
DB_NAME=ghostradar
DB_HOST=db
DB_PORT=5432
DATABASE_URL=postgresql://ghostradar:change-me@db:5432/ghostradar
AI_GATEWAY_URL=http://your-gateway-host
AI_POLL_TIMEOUT_MS=180000
AI_POLL_INTERVAL_MS=3000
ADMIN_JWT_SECRET=change-me
PORT=8088
```

### Web `.env` example on VPS

```env
NEXT_PUBLIC_API_BASE_URL=/api
```

Why `/api`:

- avoids mixed-content/CORS issues when the site is served via HTTPS
- lets Nginx proxy `/api/*` to API `:8088`

Notes:

- `setup.sh` and `setup_web.sh` do not generate secrets
- `.env` stays server-side and is preserved across deploys
- `docker-compose.yml` now reads `.env` directly via `env_file`

## 5. Packaging

From repo root:

```powershell
npm run package:release
```

This creates:

- `deploy.tar.gz` for backend + admin stack
- `deploy_web.tar.gz` for web stack

The packaging script excludes:

- `.git`
- `node_modules`
- `.next`
- `dist_stale`
- logs
- temp folders

## 6. Deploy To VPS

Preferred workflow:

```powershell
$env:VPS_HOST='your-server'
$env:VPS_USER='root'
$env:VPS_BACKEND_DIR='/app/ghostradar'
$env:VPS_WEB_DIR='/app/ghostradar_web'
npm run deploy:vps
```

Or explicit script params:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-vps.ps1 `
  -VpsHost 'your-server' `
  -VpsUser 'root' `
  -VpsBackendDir '/app/ghostradar' `
  -VpsWebDir '/app/ghostradar_web'
```

What it does:

1. packages fresh archives
2. uploads backend archive + `setup.sh`
3. uploads web archive + `setup_web.sh`
4. runs remote backend deploy
5. runs remote web deploy

If you need to run steps manually:

```bash
scp deploy.tar.gz setup.sh root@HOST:/app/ghostradar/
scp deploy_web.tar.gz setup_web.sh root@HOST:/app/ghostradar_web/
ssh root@HOST "cd /app/ghostradar && bash setup.sh"
ssh root@HOST "cd /app/ghostradar_web && bash setup_web.sh"
```

## 7. Post-Deploy Checks

On the VPS:

```bash
docker compose ps
docker logs ghost_api --tail 100
docker logs ghost_admin --tail 100
docker logs ghost_web --tail 100
```

Remote HTTP checks:

```bash
curl http://HOST:8088/health
curl http://HOST:8088/ready
curl http://HOST:8088/internal/ai-health
curl http://HOST:3000
curl http://HOST:4000/login
```

If `scan` is failing in production, inspect:

- `AI_GATEWAY_URL`
- `AI_POLL_TIMEOUT_MS`
- API logs for gateway timeout vs parse failure

If UI shows `Failed to fetch` on scan:

- ensure web `.env` uses `NEXT_PUBLIC_API_BASE_URL=/api`
- ensure Nginx has `/api/` proxy to `http://127.0.0.1:8088`
- rebuild/redeploy web after changing `.env`

## 8. Common Failure Modes

### Scan returns empty events

Usually one of:

- gateway timed out internally
- gateway returned non-JSON text
- prompt too heavy for current gateway session

Mitigation now in code:

- scan prompt is shorter
- polling timeout is configurable

### Expand uses wrong event coordinates

This was fixed by reading both `lat/lon` and `latitude/longitude`.

### Deploy drifts because `.env` gets rewritten

Avoid this entirely:

- keep `.env` only on the VPS
- never bake secrets into `setup.sh`

### Repo gets noisy and deploy bundles become unstable

Avoid committing:

- `.next`
- logs
- archives
- temp outputs
- stale generated JS

### PowerShell deploy script fails before upload

If you previously saw:

- `Cannot overwrite variable Host because it is read-only or constant`

Cause:

- script parameter named `Host` collides with built-in `$Host` variable.

Fix now in repo:

- use `-VpsHost` (or env `VPS_HOST`) with updated `scripts/deploy-vps.ps1`.

## 9. Low-Risk Deploy Routine (Recommended)

Use this exact sequence whenever you change prompt/scan logic locally.

1. Local code gate:

```powershell
cd apps/api
npm run build
cd ../..
```

2. Local runtime smoke:

```powershell
Invoke-WebRequest http://127.0.0.1:8088/health
Invoke-WebRequest -Method Delete http://127.0.0.1:8088/grid-cache/clear
Invoke-WebRequest -Method Post -ContentType 'application/json' -Body '{}' 'http://127.0.0.1:8088/scan?lat=10.7769&lon=106.7009&radiusKm=5&lang=vi&force=true'
```

3. Commit only target files:

```powershell
git add apps/api/src/services/scan.service.ts
git commit -m "chore(api): update scan prompt"
git show --stat -1
```

4. Deploy archive to VPS:

```powershell
$env:VPS_HOST='your-server'
$env:VPS_USER='root'
$env:VPS_BACKEND_DIR='/app/ghostradar'
$env:VPS_WEB_DIR='/app/ghostradar_web'
npm run deploy:vps
```

5. Post-deploy verification:

```bash
curl http://HOST:8088/health
curl http://HOST:8088/internal/ai-health
docker logs ghost_api --tail 120
```

6. Mandatory cache reset after prompt change:

```bash
curl -X DELETE http://HOST:8088/grid-cache/clear
```

If this step is skipped, users can still see old cached scan output.

## 10. Fast Rollback

If production behavior regresses after deploy:

1. Identify last good commit SHA.
2. Checkout that commit locally.
3. Re-run `npm run deploy:vps` from that state.
4. Clear server cache:

```bash
curl -X DELETE http://HOST:8088/grid-cache/clear
```

This rollback method is consistent with the current tarball-based deployment flow and does not require changing server-side git state.

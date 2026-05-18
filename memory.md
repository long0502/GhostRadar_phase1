# GhostRadar Phase 1 Memory

## Purpose

This file is the working memory for the current `GhostRadar_phase1` repo state. It is meant to help future sessions re-enter the project quickly with code-verified context instead of relying on stale notes.

## Repo Snapshot

- Product: paranormal / urban-legend exploration platform with scan, dossier, and image-generation flows
- Monorepo apps:
  - `apps/api`: Fastify + Prisma + PostgreSQL
  - `web`: Next.js 14 + React 18 public client
  - `apps/admin`: Next.js internal dashboard
- Main local entrypoint: `npm run start:dev`
- Root startup script: [scripts/start-dev.ps1](D:/Dev/GhostRadar_phase1/scripts/start-dev.ps1)

## Local Runtime

Default local ports:

- API: `http://localhost:8088`
- Web: `http://localhost:3000`
- Admin: `http://localhost:4000`
- Postgres: `127.0.0.1:5433`

What `npm run start:dev` currently does:

1. Stops conflicting Docker API container state when needed
2. Starts only the database via Docker Compose
3. Launches API locally with `tsx watch`
4. Launches web locally with Next dev server
5. Launches admin locally with Next dev server

Important references:

- Startup note: [README.md](D:/Dev/GhostRadar_phase1/README.md)
- Product context: [master.md](D:/Dev/GhostRadar_phase1/master.md)
- Docker services: [docker-compose.yml](D:/Dev/GhostRadar_phase1/docker-compose.yml)

## Public Deployment

Current public host:

- `https://ghostradar.daquynangluongxanh.com`

Related VPS app directories:

- backend/runtime app: `/app/ghostradar`
- web-only app: `/app/ghostradar_web`

Current deployment pattern that worked reliably for recent web fixes:

1. Package only the `web` runtime files into `deploy_web.tar.gz`
2. Copy `deploy_web.tar.gz` and `setup_web.sh` to `/app/ghostradar_web`
3. Run `bash setup_web.sh` on the server

`setup_web.sh` has been hardened so it:

- only cleans the expected `/app/ghostradar_web` target
- preserves server-side `.env`
- can detect either `docker-compose.yml` at app root or `web/docker-compose.yml`

Recent deploy verification used:

- local type-check with `npx tsc --noEmit` inside `web`
- server health check `curl -I http://127.0.0.1:3000`

## API Shape

The API boots from [apps/api/src/server.ts](D:/Dev/GhostRadar_phase1/apps/api/src/server.ts) and registers these main route groups:

- `/scan`
- `/events`
- `/grid-cache`
- `/queue-status`
- `/internal`
- `/health`
- `/ready`
- `/version`

Key behavior:

- CORS is open in development
- global rate limiting is enabled
- API errors are normalized into structured JSON responses
- the API process changes its working directory to `apps/api`, so relative log and storage paths resolve from there

## Current Content Flow

### Scan flow

1. Web calls `POST /scan`
2. Main scan inputs are `lat`, `lon`, `radiusKm`, `lang`, and optional `force`
3. API validates in [apps/api/src/routes/scan.ts](D:/Dev/GhostRadar_phase1/apps/api/src/routes/scan.ts)
4. Scan results are rendered onto the radar and can be clicked to open summary / dossier flows

### Expand flow

1. Web calls `POST /events/:id/expand?level=1&lang=<lang>`
2. API currently supports `level=1`
3. Expand generation lives in [apps/api/src/services/event-expand.service.ts](D:/Dev/GhostRadar_phase1/apps/api/src/services/event-expand.service.ts)
4. Returned detail content feeds the summary panel, full dossier modal, and dossier page

### Image flow

1. Web calls `POST /events/:id/generate-image`
2. API reads the latest level-1 detail for that event
3. Cached local image URLs are reused when valid
4. If needed, the API generates and localizes a new image through the gateway
5. Images are served through `/events/images/:fileName`

Primary files:

- [apps/api/src/routes/events.ts](D:/Dev/GhostRadar_phase1/apps/api/src/routes/events.ts)
- [apps/api/src/services/gemini.service.ts](D:/Dev/GhostRadar_phase1/apps/api/src/services/gemini.service.ts)
- [apps/api/src/services/event-image.service.ts](D:/Dev/GhostRadar_phase1/apps/api/src/services/event-image.service.ts)
- [web/lib/api.ts](D:/Dev/GhostRadar_phase1/web/lib/api.ts)

## Web UX State

### Radar and mobile behavior

The main radar UI lives in:

- [web/components/radar-console.tsx](D:/Dev/GhostRadar_phase1/web/components/radar-console.tsx)
- [web/components/Radar.tsx](D:/Dev/GhostRadar_phase1/web/components/Radar.tsx)
- [web/components/RadarBlip.tsx](D:/Dev/GhostRadar_phase1/web/components/RadarBlip.tsx)
- [web/app/globals.css](D:/Dev/GhostRadar_phase1/web/app/globals.css)

Current verified state:

- laptop flow works for scan, signal selection, and dossier opening
- mobile layout has dedicated responsive fixes for safe-area, sticky actions, and scroll behavior
- `Choose Location` opens a map picker and supports direct coordinate selection on the map
- on mobile, the location picker behaves like a full-screen sheet
- radar blips were unified back onto the shared SVG renderer instead of maintaining a separate mobile renderer path

Important recent mobile finding:

- an earlier mobile-only blip rendering path was removed in favor of the desktop SVG blip path because desktop was already stable and the shared renderer proved more reliable
- current mobile blips are visible, but users may still perceive them as somewhat low-contrast on certain devices / map backgrounds
- a possible next step is to change blip palette and darken / mute the map background, but that work is intentionally deferred for now to gather user reaction first

### Dossier / profile presentation

Primary files:

- [web/components/FullProfileModal.tsx](D:/Dev/GhostRadar_phase1/web/components/FullProfileModal.tsx)
- [web/app/dossier/[event_id]/page.tsx](D:/Dev/GhostRadar_phase1/web/app/dossier/[event_id]/page.tsx)

Current verified state:

- the image section was moved to the bottom of the dossier flow
- the image section is framed as `PHUC DUNG THI GIAC`
- delayed / failed image states were rewritten to feel eerie and in-world
- those waiting / error states do not mention AI
- the old `/noise.png` dependency was replaced with an internal CSS noise treatment to avoid a public `404`

## Environment Notes

Important API env behavior to remember:

- text gateway URL is configured via `AI_GATEWAY_URL`
- image gateway URL is configured via `AI_IMAGE_GATEWAY_URL`
- text provider defaults to `gemini`
- image provider defaults to `gpt`
- image jobs may use long polling / long timeout windows

Do not copy secret values from `apps/api/.env` into documentation or commits.

## Current Image Pipeline State

What is already implemented:

- invalid private `chatgpt.com/backend-api/...` image URLs are rejected
- screenshot-style fallback payloads are rejected
- successful images are localized under API storage
- detail JSON is updated with image status and localized URL information

Where this logic lives:

- [apps/api/src/services/gemini.service.ts](D:/Dev/GhostRadar_phase1/apps/api/src/services/gemini.service.ts)
- [apps/api/src/services/event-image.service.ts](D:/Dev/GhostRadar_phase1/apps/api/src/services/event-image.service.ts)
- [apps/api/src/routes/events.ts](D:/Dev/GhostRadar_phase1/apps/api/src/routes/events.ts)

## Logging And Diagnostics

Important files:

- API runtime log: [apps/api/codex.dev.out.log](D:/Dev/GhostRadar_phase1/apps/api/codex.dev.out.log)
- raw AI prompt/response log: [apps/api/raw_ai.log](D:/Dev/GhostRadar_phase1/apps/api/raw_ai.log)
- gateway debug log: [apps/api/gemini_debug.log](D:/Dev/GhostRadar_phase1/apps/api/gemini_debug.log)
- API error log: [apps/api/server_debug.log](D:/Dev/GhostRadar_phase1/apps/api/server_debug.log)
- scan debug log: [apps/api/scan_debug.log](D:/Dev/GhostRadar_phase1/apps/api/scan_debug.log)

Useful markers:

- `[EXPAND_PROMPT]`
- `[EXPAND_RAW_RESPONSE]`
- `[IMAGE_PROMPT]`
- `[GATEWAY_IMAGE_PARSE_FAILED]`
- `[GATEWAY_ERROR]`

## Operational Notes

- the API process uses `apps/api` as its working directory
- dev runs API locally rather than in Docker
- `web/.next` can still get into bad HMR states; clearing it and restarting usually fixes chunk issues
- recent Playwright-based validation left temporary local artifacts under `.playwright-cli/` and `output/playwright/`
- stray Playwright headless browser daemons can make the workstation feel heavy; if the machine becomes slow, check for `cliDaemon.js` and `playwright_chromiumdev_profile-*` Chrome processes

## Recommended Next Steps

1. Watch user feedback on current mobile blip visibility before changing palette or muting the map background
2. If contrast still feels weak on real devices, test a blip palette that separates more clearly from the green sweep and darken the radar map beneath it
3. Keep image-generation troubleshooting focused on upstream gateway reliability and artifact quality
4. Consider strengthening the `generate-image` failure contract if soft failures continue to confuse the client flow

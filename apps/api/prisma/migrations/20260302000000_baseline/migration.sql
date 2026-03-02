-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "grid_cache" (
    "id" TEXT NOT NULL,
    "grid_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grid_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "grid_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_data" JSONB NOT NULL,
    "has_detail" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_details" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "story_text" TEXT NOT NULL,
    "witness" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_signal" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fetch_key" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "normalized_at" TIMESTAMP(3),
    "normalize_error" TEXT,

    CONSTRAINT "raw_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normalized_signal" (
    "id" TEXT NOT NULL,
    "grid_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_source" TEXT NOT NULL,
    "severity" INTEGER,
    "confidence" DOUBLE PRECISION,
    "signal_hash" TEXT NOT NULL,
    "event_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normalized_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_run" (
    "id" TEXT NOT NULL,
    "grid_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "raw_count" INTEGER NOT NULL DEFAULT 0,
    "normalized_count" INTEGER NOT NULL DEFAULT 0,
    "deduped_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "ingestion_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grid_cache_grid_id_key" ON "grid_cache"("grid_id");

-- CreateIndex
CREATE INDEX "raw_signal_fetch_key_idx" ON "raw_signal"("fetch_key");

-- CreateIndex
CREATE INDEX "raw_signal_fetched_at_idx" ON "raw_signal"("fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "normalized_signal_signal_hash_key" ON "normalized_signal"("signal_hash");

-- CreateIndex
CREATE INDEX "normalized_signal_grid_id_idx" ON "normalized_signal"("grid_id");

-- CreateIndex
CREATE INDEX "normalized_signal_created_at_idx" ON "normalized_signal"("created_at");

-- CreateIndex
CREATE INDEX "idx_geo_time" ON "normalized_signal"("lat", "lon", "event_time");

-- CreateIndex
CREATE INDEX "ingestion_run_grid_id_idx" ON "ingestion_run"("grid_id");

-- CreateIndex
CREATE INDEX "ingestion_run_started_at_idx" ON "ingestion_run"("started_at");

-- AddForeignKey
ALTER TABLE "event_details" ADD CONSTRAINT "event_details_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


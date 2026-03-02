-- CreateTable
CREATE TABLE "ai_quota_policy" (
    "scope" TEXT NOT NULL,
    "daily_limit" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_quota_policy_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "ai_usage_daily" (
    "scope" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "usage_date" DATE NOT NULL,
    "ai_calls" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "scan_calls" INTEGER NOT NULL DEFAULT 0,
    "expand_calls" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("scope","scope_key","usage_date")
);

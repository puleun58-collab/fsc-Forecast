-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ForecastApprovalState" AS ENUM ('pending', 'approved', 'degraded');

-- CreateEnum
CREATE TYPE "ForecastHorizonKind" AS ENUM ('weekly', 'monthly');

-- CreateTable
CREATE TABLE "daily_price_current" (
    "id" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL DEFAULT 'national-average-opinet-diesel',
    "priceDate" TIMESTAMP(3) NOT NULL,
    "currentRevisionId" TEXT NOT NULL,
    "latestRecomputeSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_price_current_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_revision_log" (
    "id" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL DEFAULT 'national-average-opinet-diesel',
    "priceDate" TIMESTAMP(3) NOT NULL,
    "observedPriceKrwPerL" DECIMAL(10,3) NOT NULL,
    "sourceObservedAt" TIMESTAMP(3),
    "sourceRevisionToken" TEXT,
    "sourcePayload" JSONB,
    "ingestRunId" TEXT NOT NULL,
    "supersedesRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_revision_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_runs" (
    "id" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL DEFAULT 'national-average-opinet-diesel',
    "triggerKind" TEXT NOT NULL,
    "requestedByRuntime" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "sourceWindowStart" TIMESTAMP(3),
    "sourceWindowEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_indicator_history" (
    "id" TEXT NOT NULL,
    "indicatorCode" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_indicator_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recompute_snapshots" (
    "id" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL DEFAULT 'national-average-opinet-diesel',
    "triggeringIngestRunId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "triggerReason" TEXT NOT NULL,
    "currentTruthCutoffAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recompute_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_runs" (
    "id" TEXT NOT NULL,
    "recomputeSnapshotId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "approvalState" "ForecastApprovalState" NOT NULL DEFAULT 'pending',
    "backtestWeeks" INTEGER,
    "mapePct" DECIMAL(6,3),
    "maeKrwPerL" DECIMAL(10,3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_points" (
    "id" TEXT NOT NULL,
    "forecastRunId" TEXT NOT NULL,
    "horizonKind" "ForecastHorizonKind" NOT NULL,
    "horizonIndex" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "pointKrwPerL" DECIMAL(10,3) NOT NULL,
    "lowerBoundKrwPerL" DECIMAL(10,3),
    "upperBoundKrwPerL" DECIMAL(10,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commentary_runs" (
    "id" TEXT NOT NULL,
    "recomputeSnapshotId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "ruleSetVersion" TEXT,
    "commentaryText" TEXT,
    "evidencePayload" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commentary_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_runs" (
    "id" TEXT NOT NULL,
    "recomputeSnapshotId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "exportFormat" TEXT NOT NULL,
    "storageKey" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_price_current_currentRevisionId_key" ON "daily_price_current"("currentRevisionId");

-- CreateIndex
CREATE INDEX "daily_price_current_latestRecomputeSnapshotId_idx" ON "daily_price_current"("latestRecomputeSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_price_current_datasetKey_priceDate_key" ON "daily_price_current"("datasetKey", "priceDate");

-- CreateIndex
CREATE INDEX "price_revision_log_datasetKey_priceDate_createdAt_idx" ON "price_revision_log"("datasetKey", "priceDate", "createdAt");

-- CreateIndex
CREATE INDEX "ingest_runs_datasetKey_createdAt_idx" ON "ingest_runs"("datasetKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_indicator_history_indicatorCode_observedAt_key" ON "external_indicator_history"("indicatorCode", "observedAt");

-- CreateIndex
CREATE INDEX "recompute_snapshots_datasetKey_createdAt_idx" ON "recompute_snapshots"("datasetKey", "createdAt");

-- CreateIndex
CREATE INDEX "forecast_runs_recomputeSnapshotId_createdAt_idx" ON "forecast_runs"("recomputeSnapshotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_points_forecastRunId_horizonKind_horizonIndex_key" ON "forecast_points"("forecastRunId", "horizonKind", "horizonIndex");

-- CreateIndex
CREATE INDEX "commentary_runs_recomputeSnapshotId_createdAt_idx" ON "commentary_runs"("recomputeSnapshotId", "createdAt");

-- CreateIndex
CREATE INDEX "export_runs_recomputeSnapshotId_createdAt_idx" ON "export_runs"("recomputeSnapshotId", "createdAt");

-- AddForeignKey
ALTER TABLE "daily_price_current" ADD CONSTRAINT "daily_price_current_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "price_revision_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_price_current" ADD CONSTRAINT "daily_price_current_latestRecomputeSnapshotId_fkey" FOREIGN KEY ("latestRecomputeSnapshotId") REFERENCES "recompute_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_revision_log" ADD CONSTRAINT "price_revision_log_ingestRunId_fkey" FOREIGN KEY ("ingestRunId") REFERENCES "ingest_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_revision_log" ADD CONSTRAINT "price_revision_log_supersedesRevisionId_fkey" FOREIGN KEY ("supersedesRevisionId") REFERENCES "price_revision_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recompute_snapshots" ADD CONSTRAINT "recompute_snapshots_triggeringIngestRunId_fkey" FOREIGN KEY ("triggeringIngestRunId") REFERENCES "ingest_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_runs" ADD CONSTRAINT "forecast_runs_recomputeSnapshotId_fkey" FOREIGN KEY ("recomputeSnapshotId") REFERENCES "recompute_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_points" ADD CONSTRAINT "forecast_points_forecastRunId_fkey" FOREIGN KEY ("forecastRunId") REFERENCES "forecast_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commentary_runs" ADD CONSTRAINT "commentary_runs_recomputeSnapshotId_fkey" FOREIGN KEY ("recomputeSnapshotId") REFERENCES "recompute_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_recomputeSnapshotId_fkey" FOREIGN KEY ("recomputeSnapshotId") REFERENCES "recompute_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


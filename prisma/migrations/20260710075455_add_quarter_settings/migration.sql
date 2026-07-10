-- CreateEnum
CREATE TYPE "QuarterStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "FscApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "quarter_settings" (
    "id" TEXT NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "targetQuarter" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "referenceQuarter" INTEGER NOT NULL,
    "quarterStartDate" TIMESTAMP(3) NOT NULL,
    "quarterEndDate" TIMESTAMP(3) NOT NULL,
    "basePriceKrwPerL" DECIMAL(10,3) NOT NULL,
    "appliedPriceKrwPerL" DECIMAL(10,3) NOT NULL,
    "fscLowRate" DECIMAL(5,4) NOT NULL,
    "fscHighRate" DECIMAL(5,4) NOT NULL,
    "status" "QuarterStatus" NOT NULL DEFAULT 'draft',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quarter_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fsc_results" (
    "id" TEXT NOT NULL,
    "quarterSettingId" TEXT NOT NULL,
    "sourceRecomputeSnapshotId" TEXT NOT NULL,
    "forecastRunId" TEXT,
    "approvalStatus" "FscApprovalStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fsc_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quarter_settings_activeKey_key" ON "quarter_settings"("activeKey");

-- CreateIndex
CREATE INDEX "quarter_settings_isActive_idx" ON "quarter_settings"("isActive");

-- CreateIndex
CREATE INDEX "quarter_settings_status_idx" ON "quarter_settings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quarter_settings_targetYear_targetQuarter_key" ON "quarter_settings"("targetYear", "targetQuarter");

-- CreateIndex
CREATE INDEX "fsc_results_quarterSettingId_createdAt_idx" ON "fsc_results"("quarterSettingId", "createdAt");

-- CreateIndex
CREATE INDEX "fsc_results_sourceRecomputeSnapshotId_idx" ON "fsc_results"("sourceRecomputeSnapshotId");

-- AddForeignKey
ALTER TABLE "fsc_results" ADD CONSTRAINT "fsc_results_quarterSettingId_fkey" FOREIGN KEY ("quarterSettingId") REFERENCES "quarter_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fsc_results" ADD CONSTRAINT "fsc_results_sourceRecomputeSnapshotId_fkey" FOREIGN KEY ("sourceRecomputeSnapshotId") REFERENCES "recompute_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fsc_results" ADD CONSTRAINT "fsc_results_forecastRunId_fkey" FOREIGN KEY ("forecastRunId") REFERENCES "forecast_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

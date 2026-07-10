/*
  Warnings:

  - You are about to drop the column `metadata` on the `fsc_results` table. All the data in the column will be lost.
  - Added the required column `actualWeekCount` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `appliedPriceKrwPerL` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `basePriceKrwPerL` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `calculationPayload` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dataFreshnessStatus` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `diffRatio` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `forecastWeekCount` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fscHighKrwPerL` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fscHighRate` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fscLowKrwPerL` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fscLowRate` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priceDiffKrwPerL` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quarterAverageKrwPerL` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reliabilityGrade` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetQuarter` to the `fsc_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetYear` to the `fsc_results` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FscPriceKind" AS ENUM ('actual', 'forecast');

-- CreateEnum
CREATE TYPE "FscDataFreshnessStatus" AS ENUM ('fresh', 'delayed', 'stale', 'unavailable');

-- CreateEnum
CREATE TYPE "FscForecastSourceKind" AS ENUM ('weekly_point', 'monthly_point', 'carry_forward', 'applied_price_fallback', 'base_price_fallback');

-- DropIndex
DROP INDEX "fsc_results_quarterSettingId_createdAt_idx";

-- AlterTable
ALTER TABLE "fsc_results" DROP COLUMN "metadata",
ADD COLUMN     "actualWeekCount" INTEGER NOT NULL,
ADD COLUMN     "appliedPriceKrwPerL" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "basePriceKrwPerL" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "calculationFormulaVersion" TEXT NOT NULL DEFAULT 'fsc-v1',
ADD COLUMN     "calculationPayload" JSONB NOT NULL,
ADD COLUMN     "dataFreshnessStatus" "FscDataFreshnessStatus" NOT NULL,
ADD COLUMN     "diffRatio" DECIMAL(10,6) NOT NULL,
ADD COLUMN     "forecastBias13w" DECIMAL(10,3),
ADD COLUMN     "forecastBias4w" DECIMAL(10,3),
ADD COLUMN     "forecastModelVersion" TEXT,
ADD COLUMN     "forecastWeekCount" INTEGER NOT NULL,
ADD COLUMN     "fscHighKrwPerL" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "fscHighRate" DECIMAL(5,4) NOT NULL,
ADD COLUMN     "fscLowKrwPerL" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "fscLowRate" DECIMAL(5,4) NOT NULL,
ADD COLUMN     "priceDiffKrwPerL" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "quarterAverageKrwPerL" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "recent13wDirectionAccuracy" DECIMAL(10,6),
ADD COLUMN     "recent13wQuarterAveragePriceMae" DECIMAL(10,3),
ADD COLUMN     "recent13wWeeklyPriceMae" DECIMAL(10,3),
ADD COLUMN     "recent13wWeeklyPriceMape" DECIMAL(10,6),
ADD COLUMN     "recent26wWeeklyPriceMae" DECIMAL(10,3),
ADD COLUMN     "recent4wErrorTrend" TEXT,
ADD COLUMN     "recent4wWeeklyPriceMae" DECIMAL(10,3),
ADD COLUMN     "reliabilityGrade" TEXT NOT NULL,
ADD COLUMN     "scenarioName" TEXT NOT NULL DEFAULT 'base',
ADD COLUMN     "targetQuarter" INTEGER NOT NULL,
ADD COLUMN     "targetYear" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "fsc_quarter_weeks" (
    "id" TEXT NOT NULL,
    "fscResultId" TEXT NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "targetQuarter" INTEGER NOT NULL,
    "targetMonth" INTEGER NOT NULL,
    "weekNo" INTEGER NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "priceKind" "FscPriceKind" NOT NULL,
    "priceKrwPerL" DECIMAL(10,3) NOT NULL,
    "actualPriceKrwPerL" DECIMAL(10,3),
    "forecastPriceKrwPerL" DECIMAL(10,3),
    "sourcePriceDate" TIMESTAMP(3),
    "sourceRevisionIds" JSONB,
    "forecastPointId" TEXT,
    "forecastSourceKind" "FscForecastSourceKind",
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "basePriceKrwPerL" DECIMAL(10,3) NOT NULL,
    "priceDiffKrwPerL" DECIMAL(10,3) NOT NULL,
    "diffRatio" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fsc_quarter_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fsc_quarter_weeks_targetYear_targetQuarter_sequenceNo_idx" ON "fsc_quarter_weeks"("targetYear", "targetQuarter", "sequenceNo");

-- CreateIndex
CREATE INDEX "fsc_quarter_weeks_forecastPointId_idx" ON "fsc_quarter_weeks"("forecastPointId");

-- CreateIndex
CREATE UNIQUE INDEX "fsc_quarter_weeks_fscResultId_sequenceNo_key" ON "fsc_quarter_weeks"("fscResultId", "sequenceNo");

-- CreateIndex
CREATE INDEX "fsc_results_targetYear_targetQuarter_scenarioName_createdAt_idx" ON "fsc_results"("targetYear", "targetQuarter", "scenarioName", "createdAt");

-- CreateIndex
CREATE INDEX "fsc_results_forecastRunId_idx" ON "fsc_results"("forecastRunId");

-- CreateIndex
CREATE INDEX "fsc_results_approvalStatus_idx" ON "fsc_results"("approvalStatus");

-- AddForeignKey
ALTER TABLE "fsc_quarter_weeks" ADD CONSTRAINT "fsc_quarter_weeks_fscResultId_fkey" FOREIGN KEY ("fscResultId") REFERENCES "fsc_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fsc_quarter_weeks" ADD CONSTRAINT "fsc_quarter_weeks_forecastPointId_fkey" FOREIGN KEY ("forecastPointId") REFERENCES "forecast_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

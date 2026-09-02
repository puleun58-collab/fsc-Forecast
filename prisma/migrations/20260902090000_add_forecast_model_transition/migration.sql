-- CreateEnum
CREATE TYPE "ForecastModelTransitionStatus" AS ENUM ('approved_pending', 'applied', 'cancelled');

-- CreateEnum
CREATE TYPE "ForecastModelTransitionSourceKind" AS ENUM ('shadow_admin_approved', 'post_transition_rollback');

-- CreateTable
CREATE TABLE "forecast_model_transitions" (
    "id" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL DEFAULT 'national-average-opinet-diesel',
    "shadowSessionId" TEXT NOT NULL,
    "candidateFingerprint" TEXT NOT NULL,
    "baselineFingerprint" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "baselineParams" JSONB NOT NULL,
    "candidateParams" JSONB NOT NULL,
    "shadowSummary" JSONB NOT NULL,
    "sourceKind" "ForecastModelTransitionSourceKind" NOT NULL DEFAULT 'shadow_admin_approved',
    "parentTransitionId" TEXT,
    "candidateSource" TEXT NOT NULL,
    "sourceForecastRunId" TEXT NOT NULL,
    "status" "ForecastModelTransitionStatus" NOT NULL DEFAULT 'approved_pending',
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "appliedForecastRunId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecast_model_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forecast_model_transitions_datasetKey_shadowSessionId_key" ON "forecast_model_transitions"("datasetKey", "shadowSessionId");

-- CreateIndex
CREATE INDEX "forecast_model_transitions_datasetKey_status_idx" ON "forecast_model_transitions"("datasetKey", "status");

-- AddForeignKey
ALTER TABLE "forecast_model_transitions" ADD CONSTRAINT "forecast_model_transitions_sourceForecastRunId_fkey" FOREIGN KEY ("sourceForecastRunId") REFERENCES "forecast_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_model_transitions" ADD CONSTRAINT "forecast_model_transitions_appliedForecastRunId_fkey" FOREIGN KEY ("appliedForecastRunId") REFERENCES "forecast_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Only one operational setting change may wait for application per dataset.
CREATE UNIQUE INDEX "forecast_model_transitions_one_pending_per_dataset"
ON "forecast_model_transitions"("datasetKey")
WHERE "status" = 'approved_pending';

-- AddForeignKey
ALTER TABLE "forecast_model_transitions" ADD CONSTRAINT "forecast_model_transitions_parentTransitionId_fkey" FOREIGN KEY ("parentTransitionId") REFERENCES "forecast_model_transitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

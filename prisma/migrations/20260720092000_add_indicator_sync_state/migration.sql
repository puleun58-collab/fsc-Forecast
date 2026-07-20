CREATE TABLE "external_indicator_sync_states" (
    "indicatorCode" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "latestObservedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_indicator_sync_states_pkey" PRIMARY KEY ("indicatorCode")
);

CREATE INDEX "external_indicator_sync_states_status_lastAttemptAt_idx"
ON "external_indicator_sync_states"("status", "lastAttemptAt");

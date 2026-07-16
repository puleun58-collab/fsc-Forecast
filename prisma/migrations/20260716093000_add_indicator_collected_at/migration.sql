ALTER TABLE "external_indicator_history"
ADD COLUMN "collectedAt" TIMESTAMP(3);

UPDATE "external_indicator_history"
SET "collectedAt" = "createdAt"
WHERE "collectedAt" IS NULL;

ALTER TABLE "external_indicator_history"
ALTER COLUMN "collectedAt" SET NOT NULL,
ALTER COLUMN "collectedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "external_indicator_history_indicatorCode_observedAt_collectedAt_idx"
ON "external_indicator_history"("indicatorCode", "observedAt", "collectedAt");

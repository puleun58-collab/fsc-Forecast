-- Add reliability sample tracking for official FSC grades
ALTER TABLE "fsc_results"
ADD COLUMN     "reliabilitySampleCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reliabilityMinimumSampleCount" INTEGER NOT NULL DEFAULT 13;

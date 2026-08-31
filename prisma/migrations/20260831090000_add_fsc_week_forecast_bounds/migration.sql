ALTER TABLE "fsc_quarter_weeks"
  ADD COLUMN IF NOT EXISTS "forecastLowerBoundKrwPerL" DECIMAL(10, 3),
  ADD COLUMN IF NOT EXISTS "forecastUpperBoundKrwPerL" DECIMAL(10, 3);

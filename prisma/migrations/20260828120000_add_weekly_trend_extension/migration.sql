ALTER TYPE "FscForecastSourceKind" ADD VALUE IF NOT EXISTS 'weekly_trend_extension';

ALTER TABLE "fsc_quarter_weeks"
  ALTER COLUMN "priceKrwPerL" DROP NOT NULL,
  ALTER COLUMN "priceDiffKrwPerL" DROP NOT NULL,
  ALTER COLUMN "diffRatio" DROP NOT NULL;

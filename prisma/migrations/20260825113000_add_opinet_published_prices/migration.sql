CREATE TABLE "opinet_published_prices" (
    "id" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL DEFAULT 'national-average-opinet-diesel',
    "periodKind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStartDate" TIMESTAMP(3) NOT NULL,
    "periodEndDate" TIMESTAMP(3) NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "priceKrwPerL" DECIMAL(10,3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceFetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opinet_published_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "opinet_published_prices_datasetKey_periodKind_periodKey_key"
ON "opinet_published_prices"("datasetKey", "periodKind", "periodKey");

CREATE INDEX "opinet_published_prices_datasetKey_periodKind_periodEndDate_idx"
ON "opinet_published_prices"("datasetKey", "periodKind", "periodEndDate");

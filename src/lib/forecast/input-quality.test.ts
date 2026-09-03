import assert from "node:assert/strict";
import test from "node:test";

import { ForecastHorizonKind } from "@prisma/client";

import {
  buildForecastInputQuality,
  evaluateDailyDieselQuality,
  evaluateIndicatorQuality,
  evaluateWeeklyDieselQuality,
  readForecastInputQuality,
} from "./input-quality";
import type { ForecastIndicatorWeeklyPoint } from "./build-weekly-forecast";
import type { ForecastDailyPriceRow, ForecastSeriesPoint } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-03T00:00:00.000Z");

function weeklyPoint(weeksAgo: number, price: number): ForecastSeriesPoint {
  const periodEnd = new Date(NOW.getTime() - weeksAgo * WEEK_MS);

  return {
    horizonKind: ForecastHorizonKind.weekly,
    periodStart: new Date(periodEnd.getTime() - 4 * 86_400_000),
    periodEnd,
    targetDate: periodEnd,
    pointKrwPerL: price,
    sampleCount: 5,
  };
}

function weeklySeries(count: number, price = 1900): ForecastSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => weeklyPoint(count - index, price + index));
}

function dailyRow(daysAgo: number, price: number): ForecastDailyPriceRow {
  return {
    priceDate: new Date(NOW.getTime() - daysAgo * 86_400_000),
    observedPriceKrwPerL: price,
    currentRevisionId: `revision-${daysAgo}`,
  };
}

function indicatorSeries(count: number, weeksAgoOfLatest = 1): ForecastIndicatorWeeklyPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const weekEndDate = new Date(NOW.getTime() - (count - index - 1 + weeksAgoOfLatest) * WEEK_MS);

    return { weekEndDate, value: 80 + index, observedAt: weekEndDate };
  });
}

test("a complete weekly series is healthy and usable", () => {
  const result = evaluateWeeklyDieselQuality(weeklySeries(8), NOW);

  assert.equal(result.status, "healthy");
  assert.equal(result.usable, true);
  assert.equal(result.sampleCount, 8);
});

test("missing, invalid, and too short weekly history block the forecast", () => {
  assert.deepEqual(
    [
      evaluateWeeklyDieselQuality([], NOW),
      evaluateWeeklyDieselQuality([...weeklySeries(4), weeklyPoint(1, 0)], NOW),
      evaluateWeeklyDieselQuality(weeklySeries(2), NOW),
    ].map((result) => [result.status, result.usable]),
    [
      ["missing", false],
      ["invalid", false],
      ["insufficient", false],
    ],
  );
});

test("weekly rows dated after the forecast origin never pass the gate", () => {
  const withFuture = [...weeklySeries(8), weeklyPoint(-1, 1950)];
  const result = evaluateWeeklyDieselQuality(withFuture, NOW);

  assert.equal(result.status, "invalid");
  assert.equal(result.usable, false);
  assert.equal(result.reasonCode, "weekly-diesel-future-row");
});

test("a duplicated week is reported but still usable once resolved", () => {
  const duplicated = [...weeklySeries(8), weeklyPoint(1, 1930)];
  const result = evaluateWeeklyDieselQuality(duplicated, NOW);

  assert.equal(result.status, "duplicate");
  assert.equal(result.usable, true);
});

test("an unusually large weekly move is not treated as broken data", () => {
  const jumped = [...weeklySeries(8).slice(0, 7), weeklyPoint(1, 2600)];
  const result = evaluateWeeklyDieselQuality(jumped, NOW);

  assert.equal(result.status, "healthy");
  assert.equal(result.usable, true);
});

test("daily prices need five valid observations before the signal may be used", () => {
  const enough = [1, 2, 3, 4, 5, 6].map((daysAgo) => dailyRow(daysAgo, 1950));
  const short = [1, 2, 3].map((daysAgo) => dailyRow(daysAgo, 1950));

  assert.equal(evaluateDailyDieselQuality(enough, NOW).usable, true);
  assert.equal(evaluateDailyDieselQuality(short, NOW).status, "insufficient");
  assert.equal(evaluateDailyDieselQuality([], NOW).status, "missing");
});

test("duplicate daily dates collapse to one observation before counting", () => {
  const rows = [dailyRow(1, 1950), dailyRow(1, 1955), dailyRow(2, 1940), dailyRow(3, 1930)];
  const result = evaluateDailyDieselQuality(rows, NOW);

  assert.equal(result.sampleCount, 3);
  assert.equal(result.status, "insufficient");
});

test("a Friday exchange rate is still fresh over the weekend", () => {
  const monday = new Date("2026-09-07T00:00:00.000Z");
  const friday = new Date("2026-09-04T00:00:00.000Z");
  const result = evaluateIndicatorQuality({
    source: "usdKrw",
    series: [
      ...indicatorSeries(5, 2),
      { weekEndDate: friday, value: 1370, observedAt: friday },
    ],
    requiredLagWeeks: 3,
    asOf: monday,
  });

  assert.equal(result.status, "healthy");
  assert.equal(result.usable, true);
});

test("a stale or too short indicator series is dropped without failing the run", () => {
  const stale = evaluateIndicatorQuality({
    source: "dubai",
    series: indicatorSeries(6, 4),
    requiredLagWeeks: 3,
    asOf: NOW,
  });
  const short = evaluateIndicatorQuality({
    source: "dubai",
    series: indicatorSeries(3),
    requiredLagWeeks: 3,
    asOf: NOW,
  });

  assert.deepEqual(
    [stale, short].map((result) => [result.status, result.usable]),
    [
      ["stale", false],
      ["insufficient", false],
    ],
  );
});

test("an auxiliary problem downgrades the level to attention but keeps the forecast usable", () => {
  const quality = buildForecastInputQuality({
    weeklySeries: weeklySeries(10),
    dailyPrices: [1, 2, 3, 4, 5].map((daysAgo) => dailyRow(daysAgo, 1950)),
    indicatorSeries: { dubai: indicatorSeries(6), usdKrw: indicatorSeries(6, 5) },
    dubaiLagWeeks: 3,
    usdKrwLagWeeks: 3,
    evaluatedAt: NOW,
  });

  assert.equal(quality.level, "attention");
  assert.deepEqual(quality.usableInputs, {
    weeklyDiesel: true,
    dailyDiesel: true,
    dubai: true,
    usdKrw: false,
  });
});

test("healthy inputs report ok and unusable weekly prices demand action", () => {
  const healthy = buildForecastInputQuality({
    weeklySeries: weeklySeries(10),
    dailyPrices: [1, 2, 3, 4, 5].map((daysAgo) => dailyRow(daysAgo, 1950)),
    indicatorSeries: { dubai: indicatorSeries(6), usdKrw: indicatorSeries(6) },
    dubaiLagWeeks: 3,
    usdKrwLagWeeks: 3,
    evaluatedAt: NOW,
  });
  const broken = buildForecastInputQuality({
    weeklySeries: [],
    dailyPrices: [],
    indicatorSeries: { dubai: [], usdKrw: [] },
    dubaiLagWeeks: 3,
    usdKrwLagWeeks: 3,
    evaluatedAt: NOW,
  });

  assert.equal(healthy.level, "ok");
  assert.equal(broken.level, "action-required");
  assert.equal(broken.usableInputs.weeklyDiesel, false);
});

test("stored quality round-trips and legacy runs read as null", () => {
  const quality = buildForecastInputQuality({
    weeklySeries: weeklySeries(10),
    dailyPrices: [1, 2, 3, 4, 5].map((daysAgo) => dailyRow(daysAgo, 1950)),
    indicatorSeries: { dubai: indicatorSeries(6), usdKrw: indicatorSeries(6) },
    dubaiLagWeeks: 3,
    usdKrwLagWeeks: 3,
    evaluatedAt: NOW,
  });
  const stored = JSON.parse(JSON.stringify({ model: { inputQuality: quality } })) as unknown;

  assert.deepEqual(readForecastInputQuality(stored), quality);
  assert.equal(readForecastInputQuality({ model: {} }), null);
  assert.equal(readForecastInputQuality(null), null);
});

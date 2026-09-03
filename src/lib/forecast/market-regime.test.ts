import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT,
  buildMarketRegimeAnalysis,
  buildMarketRegimeTimeline,
  readMarketRegimeAnalysis,
  type MarketRegime,
} from "./market-regime";
import type { WalkForwardEvaluationPoint } from "./run-walk-forward-backtest";
import type { ForecastSeriesPoint } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_WEEK_END = Date.UTC(2026, 0, 3);
const EVALUATED_AT = new Date("2026-09-03T00:00:00.000Z");

function weekEnd(index: number): Date {
  return new Date(FIRST_WEEK_END + index * WEEK_MS);
}

function series(prices: readonly number[]): ForecastSeriesPoint[] {
  return prices.map((price, index) => ({
    horizonKind: "weekly",
    periodStart: new Date(weekEnd(index).getTime() - 6 * 24 * 60 * 60 * 1000),
    periodEnd: weekEnd(index),
    targetDate: weekEnd(index),
    pointKrwPerL: price,
    sampleCount: 5,
  }));
}

/** 잔잔한 파동과 완만한 상승이 섞인 24주. 기준 분포(13개 이상)를 채운다. */
const CALM_WAVE = [0, 3, -2, 4, -3, 2, -1, 3];
const BASE_PRICES = Array.from(
  { length: 24 },
  (_, index) => 1500 + index + CALM_WAVE[index % CALM_WAVE.length],
);
const FLAT_PRICES = Array.from({ length: 20 }, () => 1500);

function regimesOf(prices: readonly number[]): MarketRegime[] {
  return buildMarketRegimeTimeline(series(prices)).map((entry) => entry.regime);
}

function point(
  overrides: Partial<WalkForwardEvaluationPoint> & {
    originIndex: number;
    forecastKrwPerL: number;
    actualKrwPerL: number;
  },
): WalkForwardEvaluationPoint {
  const { originIndex, ...rest } = overrides;
  const absoluteErrorKrwPerL = Math.abs(rest.forecastKrwPerL - rest.actualKrwPerL);

  return {
    originWeekEndDate: weekEnd(originIndex),
    targetDate: weekEnd(originIndex + 1),
    horizonIndex: 1,
    anchorKrwPerL: 1500,
    absoluteErrorKrwPerL,
    absolutePercentageErrorPct: (absoluteErrorKrwPerL / rest.actualKrwPerL) * 100,
    actualDirection: "up",
    forecastDirection: "up",
    trendDeltaKrwPerL: 2,
    dubaiContributionRatio: 0.01,
    usdKrwContributionRatio: null,
    rawExternalAdjustmentRatio: 0.01,
    externalAdjustmentRatio: 0.01,
    externalAdjustmentCapReached: false,
    ...rest,
  };
}

function originsOf(prices: readonly number[], regime: MarketRegime): number[] {
  return buildMarketRegimeTimeline(series(prices)).flatMap((entry, index) =>
    entry.regime === regime ? [index] : [],
  );
}

test("a past origin keeps its regime when later weeks change", () => {
  const history = [...BASE_PRICES, 1540, 1552, 1564, 1576];
  const baseline = buildMarketRegimeTimeline(series(history));
  const mutated = buildMarketRegimeTimeline(
    series([...history.slice(0, 25), 9000, 100, 5000, 80]),
  );

  for (let index = 0; index <= 24; index += 1) {
    assert.equal(mutated[index].regime, baseline[index].regime);
    assert.equal(mutated[index].trend4wRatio, baseline[index].trend4wRatio);
    assert.equal(mutated[index].trendMagnitudeThreshold, baseline[index].trendMagnitudeThreshold);
    assert.equal(mutated[index].highVolatilityThreshold, baseline[index].highVolatilityThreshold);
  }
});

test("the current feature never enters its own threshold reference", () => {
  const timeline = buildMarketRegimeTimeline(series([...BASE_PRICES, 1600, 1480, 1620, 1500]));
  const shock = timeline[timeline.length - 1];
  const previous = timeline[timeline.length - 2];

  assert.equal(shock.regime, "high-volatility");
  assert.ok((shock.volatility4wRatio ?? 0) > (shock.highVolatilityThreshold ?? 0));
  // 직전 주차까지의 분포만 사용하므로 급등락 자체가 자신의 기준을 끌어올리지 않는다.
  assert.ok((shock.highVolatilityThreshold ?? 0) <= (previous.volatility4wRatio ?? 0) * 2);
});

test("classification starts only after thirteen prior features exist", () => {
  const regimes = regimesOf(FLAT_PRICES);

  // 4주 lookback 때문에 첫 유효 feature는 index 4에서 생기고, 기준 13개는 index 17에서 채워진다.
  assert.deepEqual(regimes.slice(0, 17), Array.from({ length: 17 }, () => "unclassified"));
  assert.equal(regimes[17], "stable");
});

test("high volatility outranks a strong rising trend", () => {
  const timeline = buildMarketRegimeTimeline(series([...BASE_PRICES, 1560, 1500, 1620, 1620]));
  const last = timeline[timeline.length - 1];

  assert.ok((last.trend4wRatio ?? 0) > (last.trendMagnitudeThreshold ?? 0));
  assert.equal(last.regime, "high-volatility");
});

test("steady moves are classified as rising, falling, or stable", () => {
  const rising = regimesOf([...BASE_PRICES, 1540, 1552, 1564, 1576]);
  const falling = regimesOf([...BASE_PRICES, 1520, 1516, 1512, 1508]);
  const stable = regimesOf([...BASE_PRICES, 1524, 1525, 1524, 1525]);

  assert.equal(rising[rising.length - 1], "rising");
  assert.equal(falling[falling.length - 1], "falling");
  assert.equal(stable[stable.length - 1], "stable");
});

test("a trend exactly at the threshold stays stable", () => {
  const timeline = buildMarketRegimeTimeline(series(FLAT_PRICES));
  const last = timeline[timeline.length - 1];

  assert.equal(last.trend4wRatio, 0);
  assert.equal(last.trendMagnitudeThreshold, 0);
  assert.equal(last.volatility4wRatio, 0);
  assert.equal(last.highVolatilityThreshold, 0);
  assert.equal(last.regime, "stable");
});

test("zero or invalid prices stay unclassified without throwing", () => {
  const regimes = regimesOf([...BASE_PRICES, 0, 1520, 1530, 1540]);

  assert.equal(regimes[24], "unclassified");
  assert.equal(regimes[25], "unclassified");
  assert.equal(regimes[27], "unclassified");
});

test("only one-step points are aggregated and the join uses the forecast origin", () => {
  const prices = [...BASE_PRICES, 1600, 1480, 1620, 1500];
  const weeklySeries = series(prices);
  const stableOrigin = originsOf(prices, "stable")[0];
  const volatileOrigin = originsOf(prices, "high-volatility")[0];
  const analysis = buildMarketRegimeAnalysis({
    weeklySeries,
    evaluatedAt: EVALUATED_AT,
    oneStepPoints: [
      point({ originIndex: stableOrigin, forecastKrwPerL: 1510, actualKrwPerL: 1500 }),
      point({
        originIndex: volatileOrigin,
        forecastKrwPerL: 1700,
        actualKrwPerL: 1600,
        horizonIndex: 2,
      }),
    ],
  });

  assert.equal(analysis.overall.sampleCount, 1);
  assert.equal(analysis.regimes.find((entry) => entry.regime === "stable")?.sampleCount, 1);
  assert.equal(
    analysis.regimes.find((entry) => entry.regime === "high-volatility")?.sampleCount,
    0,
  );
});

test("a point joined by its target week would land on the wrong regime", () => {
  const prices = [...BASE_PRICES, 1560, 1500, 1620, 1620];
  const timeline = buildMarketRegimeTimeline(series(prices));
  const origin = timeline.findIndex(
    (entry, index) =>
      entry.regime === "stable" && timeline[index + 1]?.regime === "high-volatility",
  );

  assert.ok(origin > 0);

  const analysis = buildMarketRegimeAnalysis({
    weeklySeries: series(prices),
    evaluatedAt: EVALUATED_AT,
    oneStepPoints: [point({ originIndex: origin, forecastKrwPerL: 1560, actualKrwPerL: 1500 })],
  });

  assert.equal(analysis.regimes.find((entry) => entry.regime === "stable")?.sampleCount, 1);
  assert.equal(
    analysis.regimes.find((entry) => entry.regime === "high-volatility")?.sampleCount,
    0,
  );
});

test("regime rows report the walk-forward metrics of their own points", () => {
  const prices = [...BASE_PRICES, 1540, 1552, 1564, 1576];
  const risingOrigins = originsOf(prices, "rising").slice(-3);
  const analysis = buildMarketRegimeAnalysis({
    weeklySeries: series(prices),
    evaluatedAt: EVALUATED_AT,
    oneStepPoints: [
      point({ originIndex: risingOrigins[0], forecastKrwPerL: 1510, actualKrwPerL: 1500 }),
      point({ originIndex: risingOrigins[1], forecastKrwPerL: 1470, actualKrwPerL: 1500 }),
      point({
        originIndex: risingOrigins[2],
        forecastKrwPerL: 1480,
        actualKrwPerL: 1500,
        actualDirection: "down",
      }),
    ],
  });
  const summary = analysis.regimes.find((entry) => entry.regime === "rising");

  assert.equal(summary?.sampleCount, 3);
  assert.equal(summary?.maeKrwPerL, 20);
  assert.equal(summary?.medianAbsoluteErrorKrwPerL, 20);
  assert.equal(summary?.maxAbsoluteErrorKrwPerL, 30);
  assert.equal(summary?.rmseKrwPerL, 21.602);
  assert.equal(summary?.mapePct, 1.333);
  assert.equal(summary?.directionAccuracyRatio, 0.667);
  assert.equal(summary?.averageTrendDeltaKrwPerL, 2);
  assert.equal(summary?.averageDubaiContributionRatio, 0.01);
  assert.equal(summary?.averageUsdKrwContributionRatio, null);
  assert.equal(summary?.capReachedCount, 0);
  assert.equal(analysis.overall.sampleCount, 3);
  assert.equal(analysis.largestErrors[0].absoluteErrorKrwPerL, 30);
  assert.equal(analysis.largestErrors[0].signedErrorKrwPerL, -30);
  assert.equal(analysis.largestErrors[0].regime, "rising");
  assert.equal(analysis.largestErrors[0].directionHit, true);
});

test("the weakest regime needs the minimum report sample count", () => {
  const prices = [...BASE_PRICES, 1540, 1552, 1564, 1576];
  const risingOrigins = originsOf(prices, "rising").slice(-3);
  const volatileOrigins = originsOf(prices, "high-volatility").slice(
    0,
    MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT - 1,
  );

  assert.equal(risingOrigins.length, MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT);
  assert.equal(volatileOrigins.length, MARKET_REGIME_MIN_REPORT_SAMPLE_COUNT - 1);

  const analysis = buildMarketRegimeAnalysis({
    weeklySeries: series(prices),
    evaluatedAt: EVALUATED_AT,
    oneStepPoints: [
      ...risingOrigins.map((originIndex) =>
        point({ originIndex, forecastKrwPerL: 1530, actualKrwPerL: 1500 }),
      ),
      ...volatileOrigins.map((originIndex) =>
        point({ originIndex, forecastKrwPerL: 1900, actualKrwPerL: 1500 }),
      ),
    ],
  });

  assert.ok(
    (analysis.regimes.find((entry) => entry.regime === "high-volatility")?.maeKrwPerL ?? 0) > 300,
  );
  assert.equal(analysis.weakestRegime, "rising");
});

test("external indicator values never change the regime classification", () => {
  const prices = [...BASE_PRICES, 1540, 1552, 1564, 1576];
  const origin = originsOf(prices, "rising").slice(-1)[0];
  const base = buildMarketRegimeAnalysis({
    weeklySeries: series(prices),
    evaluatedAt: EVALUATED_AT,
    oneStepPoints: [point({ originIndex: origin, forecastKrwPerL: 1540, actualKrwPerL: 1530 })],
  });
  const shifted = buildMarketRegimeAnalysis({
    weeklySeries: series(prices),
    evaluatedAt: EVALUATED_AT,
    oneStepPoints: [
      point({
        originIndex: origin,
        forecastKrwPerL: 1540,
        actualKrwPerL: 1530,
        dubaiContributionRatio: 0.9,
        usdKrwContributionRatio: -0.4,
        externalAdjustmentRatio: 0.03,
        externalAdjustmentCapReached: true,
      }),
    ],
  });

  assert.equal(shifted.currentRegime, base.currentRegime);
  assert.deepEqual(
    shifted.regimes.map((entry) => entry.sampleCount),
    base.regimes.map((entry) => entry.sampleCount),
  );
  assert.equal(shifted.regimes.find((entry) => entry.regime === "rising")?.capReachedCount, 1);
});

test("the diagnosis never mutates the forecast inputs it reads", () => {
  const prices = [...BASE_PRICES, 1540, 1552, 1564, 1576];
  const weeklySeries = series(prices);
  const oneStepPoints = [
    point({ originIndex: prices.length - 2, forecastKrwPerL: 1560, actualKrwPerL: 1540 }),
    point({ originIndex: prices.length - 1, forecastKrwPerL: 1580, actualKrwPerL: 1576 }),
  ];
  const seriesSnapshot = structuredClone(weeklySeries);
  const pointsSnapshot = structuredClone(oneStepPoints);

  buildMarketRegimeAnalysis({ weeklySeries, oneStepPoints, evaluatedAt: EVALUATED_AT });

  assert.deepEqual(weeklySeries, seriesSnapshot);
  assert.deepEqual(oneStepPoints, pointsSnapshot);
});

test("stored analysis round-trips and missing metadata reads as null", () => {
  const prices = [...BASE_PRICES, 1540, 1552, 1564, 1576];
  const analysis = buildMarketRegimeAnalysis({
    weeklySeries: series(prices),
    evaluatedAt: EVALUATED_AT,
    oneStepPoints: [
      point({ originIndex: prices.length - 1, forecastKrwPerL: 1540, actualKrwPerL: 1530 }),
    ],
  });
  const stored = JSON.parse(JSON.stringify({ model: { marketRegimeAnalysis: analysis } }));

  assert.equal(analysis.regimes.length, 4);
  assert.deepEqual(readMarketRegimeAnalysis(stored), analysis);
  assert.equal(readMarketRegimeAnalysis({ model: {} }), null);
  assert.equal(readMarketRegimeAnalysis(null), null);
});

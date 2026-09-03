import assert from "node:assert/strict";
import test from "node:test";

import { FALLBACK_FORECAST_MODEL_PARAMS, type ForecastModelParams } from "./forecast-model-config";
import {
  readSignalForwardValidation,
  recordSignalForwardCycle,
  selectForwardSignals,
  summarizeSignalForwardValidation,
  type SignalForwardPrediction,
  type SignalForwardValidation,
} from "./signal-forward-validation";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_TARGET = Date.UTC(2026, 0, 15);
const MODEL_VERSION = "weekly-anchor-trend-v2";

const PARAMS: ForecastModelParams = {
  ...FALLBACK_FORECAST_MODEL_PARAMS,
  modelId: "C",
  dubai: { lagWeeks: 1, weight: 0.2 },
  usdKrw: { lagWeeks: 1, weight: 0.05 },
  dailySignal: { lookbackObservations: 5, weight: 0.25 },
};

function prediction(
  index: number,
  overrides: Partial<SignalForwardPrediction> = {},
): SignalForwardPrediction {
  const targetDate = new Date(FIRST_TARGET + index * WEEK_MS);

  return {
    signal: "dubai",
    originWeekEndDate: new Date(targetDate.getTime() - WEEK_MS),
    targetDate,
    issuedAt: new Date(targetDate.getTime() - WEEK_MS + 3_600_000),
    baselineForecastKrwPerL: 1980,
    ablatedForecastKrwPerL: 2000,
    ...overrides,
  };
}

function cycle(
  previous: SignalForwardValidation | null,
  predictions: readonly SignalForwardPrediction[],
  confirmed: readonly { index: number; actual: number }[] = [],
  params: ForecastModelParams = PARAMS,
): SignalForwardValidation {
  return recordSignalForwardCycle({
    previous,
    baselineParams: params,
    modelVersion: MODEL_VERSION,
    predictions,
    confirmedWeeks: confirmed.map((week) => ({
      targetDate: new Date(FIRST_TARGET + week.index * WEEK_MS),
      actualKrwPerL: week.actual,
    })),
    now: new Date("2026-01-08T01:00:00.000Z"),
  });
}

test("only active signals get a diagnostic forecast slot", () => {
  assert.deepEqual(selectForwardSignals(PARAMS), ["dubai", "usdKrw", "dailySignal"]);
  assert.deepEqual(selectForwardSignals(FALLBACK_FORECAST_MODEL_PARAMS), []);
});

test("a new target opens one observation per signal", () => {
  const validation = cycle(null, [
    prediction(0),
    prediction(0, { signal: "usdKrw", ablatedForecastKrwPerL: 1985 }),
  ]);

  assert.deepEqual(
    validation.sessions.map((session) => [session.signal, session.observations.length]),
    [
      ["dubai", 1],
      ["usdKrw", 1],
    ],
  );
});

test("repeating the same target never adds a sample or rewrites the issued value", () => {
  const first = cycle(null, [prediction(0)]);
  const second = cycle(first, [prediction(0, { baselineForecastKrwPerL: 1900 })]);

  assert.equal(second.sessions[0].observations.length, 1);
  assert.equal(second.sessions[0].observations[0].baselineForecastKrwPerL, 1980);
});

test("a confirmed week fills the actual and scores both forecasts", () => {
  const issued = cycle(null, [prediction(0)]);
  const resolved = cycle(issued, [prediction(1)], [{ index: 0, actual: 1985 }]);
  const [summary] = summarizeSignalForwardValidation(resolved);

  assert.equal(summary.completedSampleCount, 1);
  assert.equal(summary.baselineMaeKrwPerL, 5);
  assert.equal(summary.ablatedMaeKrwPerL, 15);
  assert.equal(summary.maeContributionKrwPerL, 10);
  assert.equal(summary.status, "validating");
});

test("a signal that made the forecast worse reports a negative contribution", () => {
  const issued = cycle(null, [prediction(0, { baselineForecastKrwPerL: 2020, ablatedForecastKrwPerL: 1990 })]);
  const resolved = cycle(issued, [], [{ index: 0, actual: 2000 }]);
  const [summary] = summarizeSignalForwardValidation(resolved);

  assert.equal(summary.baselineMaeKrwPerL, 20);
  assert.equal(summary.ablatedMaeKrwPerL, 10);
  assert.equal(summary.maeContributionKrwPerL, -10);
});

test("no verdict is given before the thirteenth confirmed week", () => {
  let validation = cycle(null, [prediction(0)]);

  for (let index = 1; index < 12; index += 1) {
    validation = cycle(validation, [prediction(index)], [{ index: index - 1, actual: 1985 }]);
  }

  const [summary] = summarizeSignalForwardValidation(validation);

  assert.equal(summary.completedSampleCount, 11);
  assert.equal(summary.status, "validating");
});

test("thirteen confirmed weeks settle the verdict in both directions", () => {
  const build = (baseline: number, ablated: number) => {
    let validation = cycle(null, [prediction(0, { baselineForecastKrwPerL: baseline, ablatedForecastKrwPerL: ablated })]);

    for (let index = 1; index <= 13; index += 1) {
      validation = cycle(
        validation,
        [prediction(index, { baselineForecastKrwPerL: baseline, ablatedForecastKrwPerL: ablated })],
        [{ index: index - 1, actual: 2000 }],
      );
    }

    return summarizeSignalForwardValidation(validation)[0];
  };
  const helpful = build(1995, 1970);
  const harmful = build(1970, 1995);

  assert.equal(helpful.completedSampleCount, 13);
  assert.equal(helpful.status, "improved");
  assert.equal(harmful.status, "worsened");
});

test("changing the operating setting starts a fresh comparison session", () => {
  const issued = cycle(null, [prediction(0)], [], PARAMS);
  const changed: ForecastModelParams = { ...PARAMS, trendLookbackWeeks: 6 };
  const restarted = cycle(issued, [prediction(1)], [], changed);

  assert.equal(restarted.sessions[0].observations.length, 1);
  assert.notEqual(restarted.sessions[0].baselineFingerprint, issued.sessions[0].baselineFingerprint);
});

test("turning a signal off keeps the finished samples but adds no new ones", () => {
  const issued = cycle(null, [prediction(0)]);
  const withoutSignal = cycle(issued, []);

  assert.equal(withoutSignal.sessions.length, 1);
  assert.equal(withoutSignal.sessions[0].observations.length, 1);
});

test("stored sessions round-trip and legacy runs read as null", () => {
  const validation = cycle(null, [prediction(0)]);
  const stored = JSON.parse(
    JSON.stringify({ model: { signalForwardValidation: validation } }),
  ) as unknown;

  assert.deepEqual(readSignalForwardValidation(stored), validation);
  assert.equal(readSignalForwardValidation({ model: {} }), null);
});

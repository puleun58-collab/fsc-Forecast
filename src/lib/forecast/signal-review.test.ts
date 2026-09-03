import assert from "node:assert/strict";
import test from "node:test";

import type { ForecastInputQuality } from "./input-quality";
import type {
  ForecastSignalContribution,
  SignalContributionStatus,
} from "./signal-contribution";
import type { SignalForwardValidation } from "./signal-forward-validation";
import { buildSignalReview, resolveSignalReviewStatus } from "./signal-review";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_TARGET = Date.UTC(2026, 0, 15);

function contribution(status: SignalContributionStatus): ForecastSignalContribution {
  const window = {
    windowWeeks: 13,
    sampleCount: 13,
    baselineMaeKrwPerL: 17,
    ablatedMaeKrwPerL: 20.4,
    maeContributionKrwPerL: 3.4,
    baselineMapePct: 0.9,
    ablatedMapePct: 1.08,
    mapeContributionPctPoint: 0.18,
  };

  return {
    version: 1,
    evaluatedAt: "2026-04-01T00:00:00.000Z",
    recentWindowWeeks: 13,
    longWindowWeeks: 26,
    signals: [
      { signal: "trend", status: "not-separable", recent: null, long: null },
      { signal: "dubai", status, recent: window, long: { ...window, windowWeeks: 26 } },
    ],
  };
}

function forward(
  observations: { baseline: number; ablated: number; actual: number | null }[],
): SignalForwardValidation {
  return {
    version: 1,
    sessions: [
      {
        signal: "dubai",
        baselineFingerprint: "fingerprint",
        startedAt: "2026-01-08T00:00:00.000Z",
        observations: observations.map((observation, index) => ({
          originWeekEndDate: new Date(FIRST_TARGET + (index - 1) * WEEK_MS).toISOString(),
          targetDate: new Date(FIRST_TARGET + index * WEEK_MS).toISOString(),
          issuedAt: new Date(FIRST_TARGET + (index - 1) * WEEK_MS).toISOString(),
          baselineForecastKrwPerL: observation.baseline,
          ablatedForecastKrwPerL: observation.ablated,
          actualKrwPerL: observation.actual,
        })),
      },
    ],
  };
}

function completedForward(baseline: number, ablated: number): SignalForwardValidation {
  return forward(
    Array.from({ length: 13 }, () => ({ baseline, ablated, actual: 2000 })),
  );
}

function decisionOf(
  backtest: SignalContributionStatus,
  validation: SignalForwardValidation | null,
  inputQuality: ForecastInputQuality | null = null,
) {
  return buildSignalReview({
    contribution: contribution(backtest),
    forwardValidation: validation,
    inputQuality,
  }).find((decision) => decision.signal === "dubai");
}

test("agreement between the backtest and live results keeps the signal", () => {
  const decision = decisionOf("helpful", completedForward(1995, 1970));

  assert.equal(decision?.status, "keep");
  assert.deepEqual(decision?.reasons, ["backtest-helpful", "forward-helpful"]);
});

test("both sides pointing the other way opens a removal review", () => {
  const decision = decisionOf("harmful", completedForward(1970, 1995));

  assert.equal(decision?.status, "review-removal");
  assert.deepEqual(decision?.reasons, ["backtest-harmful", "forward-harmful"]);
});

test("a conflict between past and live results only downgrades to watch", () => {
  assert.equal(decisionOf("helpful", completedForward(1970, 1995))?.status, "watch");
  assert.equal(decisionOf("harmful", completedForward(1995, 1970))?.status, "watch");
});

test("mixed metrics never read as a removal case", () => {
  assert.equal(resolveSignalReviewStatus("mixed", "improved"), "watch");
  assert.equal(resolveSignalReviewStatus("harmful", "mixed"), "watch");
});

test("an unfinished forward window holds the verdict back", () => {
  const decision = decisionOf(
    "harmful",
    forward([
      { baseline: 1970, ablated: 1995, actual: 2000 },
      { baseline: 1970, ablated: 1995, actual: null },
    ]),
  );

  assert.equal(decision?.status, "undecided");
  assert.equal(decision?.forwardSampleCount, 1);
  assert.ok(decision?.reasons.includes("forward-incomplete"));
});

test("a signal without any forward samples stays undecided", () => {
  const decision = decisionOf("harmful", null);

  assert.equal(decision?.status, "undecided");
  assert.deepEqual(decision?.reasons, ["backtest-harmful", "forward-incomplete"]);
});

test("a stale data source is reported separately from a performance problem", () => {
  const inputQuality: ForecastInputQuality = {
    version: 1,
    evaluatedAt: "2026-04-01T00:00:00.000Z",
    level: "attention",
    results: [
      {
        source: "dubai",
        status: "stale",
        usable: false,
        latestDataDate: "2026-03-01T00:00:00.000Z",
        sampleCount: 6,
        reasonCode: "dubai-stale",
      },
    ],
    usableInputs: { weeklyDiesel: true, dailyDiesel: true, dubai: false, usdKrw: true },
  };
  const decision = decisionOf("harmful", completedForward(1970, 1995), inputQuality);

  assert.equal(decision?.dataQualityStatus, "stale");
  assert.ok(decision?.reasons.includes("data-quality-degraded"));
});

test("an unused signal is never judged, and trend is left out entirely", () => {
  const decisions = buildSignalReview({
    contribution: contribution("not-used"),
    forwardValidation: null,
    inputQuality: null,
  });

  assert.deepEqual(
    decisions.map((decision) => [decision.signal, decision.status]),
    [["dubai", "undecided"]],
  );
  assert.ok(decisions[0].reasons.includes("signal-not-used"));
});

test("runs without contribution analysis produce no review rows", () => {
  assert.deepEqual(
    buildSignalReview({ contribution: null, forwardValidation: null, inputQuality: null }),
    [],
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  readIntervalForwardValidation,
  recordIntervalForwardCycle,
  selectPublishableHorizonWeeks,
  summarizeIntervalForwardValidation,
  type IntervalForwardValidation,
  type IssuedIntervalPoint,
} from "./interval-forward-validation";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_ORIGIN = Date.UTC(2026, 0, 8);

function issued(
  originIndex: number,
  horizonWeeks: number,
  overrides: Partial<IssuedIntervalPoint> = {},
): IssuedIntervalPoint {
  const originWeekEndDate = new Date(FIRST_ORIGIN + originIndex * WEEK_MS);

  return {
    horizonWeeks,
    originWeekEndDate,
    targetDate: new Date(originWeekEndDate.getTime() + horizonWeeks * WEEK_MS),
    issuedAt: new Date(originWeekEndDate.getTime() + 3_600_000),
    forecastKrwPerL: 2050,
    lowerKrwPerL: 1992,
    upperKrwPerL: 2117,
    calibrationSampleCount: 20,
    source: "horizon",
    ...overrides,
  };
}

function cycle(
  previous: IntervalForwardValidation | null,
  points: readonly IssuedIntervalPoint[],
  confirmed: readonly { originIndex: number; horizonWeeks: number; actual: number }[] = [],
): IntervalForwardValidation {
  return recordIntervalForwardCycle({
    previous,
    issued: points,
    confirmedWeeks: confirmed.map((week) => ({
      targetDate: new Date(FIRST_ORIGIN + (week.originIndex + week.horizonWeeks) * WEEK_MS),
      actualKrwPerL: week.actual,
    })),
  });
}

test("each issued horizon opens its own frozen observation", () => {
  const validation = cycle(null, [issued(0, 1), issued(0, 4), issued(0, 13)]);

  assert.deepEqual(
    validation.observations.map((observation) => observation.horizonWeeks),
    [1, 4, 13],
  );
  assert.equal(validation.observations[0].actualKrwPerL, null);
  assert.equal(validation.observations[0].calibrationSource, "horizon");
});

test("re-running the same week never rewrites an issued range", () => {
  const first = cycle(null, [issued(0, 4)]);
  const repeated = cycle(first, [issued(0, 4, { lowerKrwPerL: 1900, upperKrwPerL: 2200 })]);

  assert.equal(repeated.observations.length, 1);
  assert.equal(repeated.observations[0].lowerKrwPerL, 1992);
  assert.equal(repeated.observations[0].upperKrwPerL, 2117);
});

test("a confirmed actual inside the stored range counts as a hit, outside as a miss", () => {
  const opened = cycle(null, [issued(0, 1), issued(1, 1)]);
  const resolved = cycle(opened, [], [
    { originIndex: 0, horizonWeeks: 1, actual: 2046 },
    { originIndex: 1, horizonWeeks: 1, actual: 2200 },
  ]);

  assert.deepEqual(
    resolved.observations.map((observation) => observation.hit),
    [true, false],
  );
});

test("values exactly on the boundary count as hits", () => {
  const opened = cycle(null, [issued(0, 1), issued(1, 1)]);
  const resolved = cycle(opened, [], [
    { originIndex: 0, horizonWeeks: 1, actual: 1992 },
    { originIndex: 1, horizonWeeks: 1, actual: 2117 },
  ]);

  assert.deepEqual(
    resolved.observations.map((observation) => observation.hit),
    [true, true],
  );
});

test("weeks without an actual stay pending and never enter the hit rate", () => {
  const opened = cycle(null, [issued(0, 1), issued(1, 1)]);
  const resolved = cycle(opened, [], [{ originIndex: 0, horizonWeeks: 1, actual: 2046 }]);
  const [summary] = summarizeIntervalForwardValidation(resolved);

  assert.equal(summary.coverageSampleCount, 1);
  assert.equal(summary.pendingSampleCount, 1);
  assert.equal(summary.coverageRatio, 1);
});

test("a well calibrated horizon becomes publishable, a tight one does not", () => {
  const build = (hits: number, total: number) => {
    let validation = cycle(
      null,
      Array.from({ length: total }, (_, index) => issued(index, 1)),
    );

    validation = cycle(
      validation,
      [],
      Array.from({ length: total }, (_, index) => ({
        originIndex: index,
        horizonWeeks: 1,
        actual: index < hits ? 2046 : 2300,
      })),
    );

    return summarizeIntervalForwardValidation(validation)[0];
  };
  const calibrated = build(8, 10);
  const narrow = build(4, 10);

  assert.equal(calibrated.status, "calibrated");
  assert.equal(calibrated.publication, "eligible");
  assert.equal(narrow.status, "too-narrow");
  assert.equal(narrow.publication, "pending");
});

test("a short verification run stays in validating and is not published", () => {
  const opened = cycle(null, [issued(0, 8), issued(1, 8)]);
  const resolved = cycle(opened, [], [{ originIndex: 0, horizonWeeks: 8, actual: 2046 }]);
  const [summary] = summarizeIntervalForwardValidation(resolved);

  assert.equal(summary.status, "validating");
  assert.equal(summary.publication, "pending");
});

test("publication requires the switch and an eligible horizon", () => {
  let validation = cycle(
    null,
    Array.from({ length: 10 }, (_, index) => issued(index, 1)),
  );
  validation = cycle(
    validation,
    [],
    Array.from({ length: 10 }, (_, index) => ({
      originIndex: index,
      horizonWeeks: 1,
      actual: index < 8 ? 2046 : 2300,
    })),
  );

  assert.deepEqual(selectPublishableHorizonWeeks(validation, true), [1]);
  assert.deepEqual(selectPublishableHorizonWeeks(validation, false), []);
  assert.deepEqual(selectPublishableHorizonWeeks(null, true), []);
});

test("stored validation round-trips and legacy runs read as null", () => {
  const validation = cycle(null, [issued(0, 1)]);
  const stored = JSON.parse(
    JSON.stringify({ model: { intervalForwardValidation: validation } }),
  ) as unknown;

  assert.deepEqual(readIntervalForwardValidation(stored), validation);
  assert.equal(readIntervalForwardValidation({ model: {} }), null);
});

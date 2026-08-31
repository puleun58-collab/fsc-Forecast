import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import {
  applyReliabilityGuardrails,
  calculateBaseReliabilityGrade,
  type ReliabilityDataFreshnessStatus,
  type ReliabilityGrade,
} from './reliability-grade';

function grade(
  mapePct: number | null,
  options: {
    sampleCount?: number;
    recent4wErrorTrend?: string | null;
    recent13wMae?: number | null;
    recent26wMae?: number | null;
    dataFreshnessStatus?: ReliabilityDataFreshnessStatus;
  } = {},
): { base: ReliabilityGrade; final: ReliabilityGrade; reasons: string[] } {
  const base = calculateBaseReliabilityGrade(
    options.sampleCount ?? 18,
    mapePct === null ? null : new Prisma.Decimal(mapePct),
  );
  const guardrails = applyReliabilityGuardrails({
    baseGrade: base,
    recent4wErrorTrend: options.recent4wErrorTrend === undefined ? 'stable' : options.recent4wErrorTrend,
    recent13wMaeKrwPerL: new Prisma.Decimal(options.recent13wMae ?? 20),
    recent26wMaeKrwPerL: new Prisma.Decimal(options.recent26wMae ?? 22),
    dataFreshnessStatus: options.dataFreshnessStatus ?? 'fresh',
  });

  return { base, final: guardrails.grade, reasons: guardrails.reasons };
}

test('base reliability grade follows the 13-week MAPE thresholds at the boundaries', () => {
  const cases: Array<[number, ReliabilityGrade]> = [
    [1.0, 'A+'],
    [1.01, 'A'],
    [1.5, 'A'],
    [1.51, 'B'],
    [2.5, 'B'],
    [2.51, 'C'],
    [4.0, 'C'],
    [4.01, 'D'],
    [6.0, 'D'],
    [6.01, 'E'],
  ];

  for (const [mape, expected] of cases) {
    assert.equal(
      calculateBaseReliabilityGrade(18, new Prisma.Decimal(mape)),
      expected,
      `MAPE ${mape} should map to ${expected}`,
    );
  }
});

test('insufficient samples or missing MAPE keep the grade unrated', () => {
  assert.equal(calculateBaseReliabilityGrade(12, new Prisma.Decimal(0.8)), 'U');
  assert.equal(calculateBaseReliabilityGrade(18, null), 'U');
  assert.equal(grade(0.8, { sampleCount: 12 }).final, 'U');
  assert.equal(grade(null).final, 'U');
  assert.deepEqual(grade(null).reasons, []);
});

test('stable recent errors and a stable long window keep the top grade', () => {
  const result = grade(0.8);

  assert.equal(result.base, 'A+');
  assert.equal(result.final, 'A+');
  assert.deepEqual(result.reasons, []);
});

test('worsening recent errors downgrade one step', () => {
  assert.equal(grade(0.8, { recent4wErrorTrend: 'worsening' }).final, 'A');
  assert.equal(grade(1.3, { recent4wErrorTrend: 'worsening' }).final, 'B');
  assert.equal(grade(1.7, { recent4wErrorTrend: 'worsening' }).final, 'C');
  assert.deepEqual(grade(0.8, { recent4wErrorTrend: 'worsening' }).reasons, [
    'recent_4w_error_worsening',
  ]);
});

test('worsening errors with long-window instability downgrade at most two steps', () => {
  const result = grade(0.8, {
    recent4wErrorTrend: 'worsening',
    recent13wMae: 20,
    recent26wMae: 32,
  });

  assert.equal(result.base, 'A+');
  assert.equal(result.final, 'B');
  assert.deepEqual(result.reasons, ['recent_4w_error_worsening', 'long_window_instability']);
  assert.equal(
    grade(6.5, { recent4wErrorTrend: 'worsening', recent13wMae: 20, recent26wMae: 32 }).final,
    'E',
  );
});

test('long-window caution only caps the top grade without downgrading lower grades', () => {
  const capped = grade(0.8, { recent13wMae: 20, recent26wMae: 26 });
  const untouched = grade(1.7, { recent13wMae: 20, recent26wMae: 26 });

  assert.equal(capped.final, 'A');
  assert.deepEqual(capped.reasons, ['long_window_caution']);
  assert.equal(untouched.final, 'B');
  assert.deepEqual(untouched.reasons, []);
});

test('stale data caps the top grade and unavailable data blocks the rating', () => {
  const stale = grade(0.8, { dataFreshnessStatus: 'stale' });
  const unavailable = grade(0.8, { dataFreshnessStatus: 'unavailable' });
  const delayed = grade(0.8, { dataFreshnessStatus: 'delayed' });

  assert.equal(stale.final, 'A');
  assert.deepEqual(stale.reasons, ['data_stale']);
  assert.equal(unavailable.final, 'U');
  assert.deepEqual(unavailable.reasons, ['data_unavailable']);
  assert.equal(delayed.final, 'A+');
  assert.deepEqual(delayed.reasons, ['data_delayed']);
});

test('missing guardrail metrics prevent an A+ rating', () => {
  const missingTrend = grade(0.8, { recent4wErrorTrend: null });

  assert.equal(missingTrend.final, 'A');
  assert.deepEqual(missingTrend.reasons, ['incomplete_guardrail_metrics']);
});

test('grades below the top are unaffected by stable guardrails', () => {
  assert.equal(grade(1.3).final, 'A');
  assert.equal(grade(1.7).final, 'B');
  assert.equal(grade(3.0).final, 'C');
  assert.equal(grade(5.0).final, 'D');
  assert.equal(grade(7.0).final, 'E');
});

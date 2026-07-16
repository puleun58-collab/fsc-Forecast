import assert from 'node:assert/strict';
import test from 'node:test';

import { selectLatestIndicatorStates } from './latest-indicator-states';

test('selectLatestIndicatorStates chooses the most recent valid observation per indicator', () => {
  const latestStates = selectLatestIndicatorStates([
    {
      indicatorCode: 'usd-krw',
      observedAt: new Date('2026-07-02T00:00:00.000Z'),
      collectedAt: new Date('2026-07-08T01:48:19.784Z'),
      value: 1538.05,
    },
    {
      indicatorCode: 'usd-krw',
      observedAt: new Date('2026-07-10T00:00:00.000Z'),
      collectedAt: new Date('2026-07-15T07:48:05.207Z'),
      value: 1501.06,
    },
    {
      indicatorCode: 'dubai',
      observedAt: new Date('2026-05-01T00:00:00.000Z'),
      collectedAt: new Date('2026-07-08T01:48:05.207Z'),
      value: 100.3643,
    },
    {
      indicatorCode: 'dubai',
      observedAt: new Date('2026-06-01T00:00:00.000Z'),
      collectedAt: new Date('2026-07-15T07:48:05.207Z'),
      value: 79.5395,
    },
  ]);

  assert.deepEqual(
    latestStates.map((state) => ({
      indicatorCode: state.indicatorCode,
      observedAt: state.observedAt.toISOString(),
      collectedAt: state.collectedAt.toISOString(),
      value: state.value,
    })),
    [
      {
        indicatorCode: 'dubai',
        observedAt: '2026-06-01T00:00:00.000Z',
        collectedAt: '2026-07-15T07:48:05.207Z',
        value: 79.5395,
      },
      {
        indicatorCode: 'usd-krw',
        observedAt: '2026-07-10T00:00:00.000Z',
        collectedAt: '2026-07-15T07:48:05.207Z',
        value: 1501.06,
      },
    ],
  );
});

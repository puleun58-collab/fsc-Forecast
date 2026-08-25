import assert from 'node:assert/strict';
import test from 'node:test';

import { isFscResultStaleForForecast } from './forecast-readiness';

const source = {
  recomputeSnapshotId: 'snapshot-new',
  forecastRunId: 'forecast-new',
};

test('a result created during the snapshot/forecast race is stale even for the same snapshot', () => {
  assert.equal(
    isFscResultStaleForForecast(
      {
        sourceRecomputeSnapshotId: 'snapshot-new',
        forecastRunId: null,
      },
      source,
    ),
    true,
  );
});

test('only a result linked to both the latest ready snapshot and forecast run is current', () => {
  assert.equal(
    isFscResultStaleForForecast(
      {
        sourceRecomputeSnapshotId: 'snapshot-new',
        forecastRunId: 'forecast-new',
      },
      source,
    ),
    false,
  );
  assert.equal(
    isFscResultStaleForForecast(
      {
        sourceRecomputeSnapshotId: 'snapshot-old',
        forecastRunId: 'forecast-new',
      },
      source,
    ),
    true,
  );
});

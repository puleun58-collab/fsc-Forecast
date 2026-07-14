import assert from 'node:assert/strict';
import test from 'node:test';

import { externalIndicatorCodes } from './catalog';
import { syncExternalIndicators } from './sync-external-indicators';
import type { ExternalIndicatorProviderResult } from './provider-contract';

const providerResult: ExternalIndicatorProviderResult = {
  providerKey: 'test-provider',
  points: [
    {
      indicatorCode: 'wti',
      observedAt: new Date('2026-07-13T00:00:00.000Z'),
      value: 70.12,
    },
  ],
};

test('syncExternalIndicators fetches default codes and persists provider results', async () => {
  const requests: Array<{ indicatorCodes: readonly string[] }> = [];

  const result = await syncExternalIndicators({
    deps: {
      provider: {
        providerKey: 'test-provider',
        supportedIndicatorCodes: externalIndicatorCodes,
        async fetchHistory(request) {
          requests.push({ indicatorCodes: request.indicatorCodes });
          return providerResult;
        },
      },
      async runSync({ providerResult: received }) {
        assert.equal(received, providerResult);
        return {
          providerKey: received.providerKey,
          acceptedPointCount: received.points.length,
          persistedCount: 1,
          createdCount: 1,
          updatedCount: 0,
          records: [],
        };
      },
    },
  });

  assert.deepEqual(requests, [{ indicatorCodes: externalIndicatorCodes }]);
  assert.equal(result.providerKey, 'test-provider');
  assert.equal(result.acceptedPointCount, 1);
  assert.equal(result.persistedCount, 1);
});

test('syncExternalIndicators respects explicit code filters', async () => {
  const requests: Array<{ indicatorCodes: readonly string[] }> = [];

  await syncExternalIndicators({
    indicatorCodes: ['dubai', 'usd-krw'],
    deps: {
      provider: {
        providerKey: 'test-provider',
        supportedIndicatorCodes: externalIndicatorCodes,
        async fetchHistory(request) {
          requests.push({ indicatorCodes: request.indicatorCodes });
          return providerResult;
        },
      },
      async runSync() {
        return {
          providerKey: 'test-provider',
          acceptedPointCount: 1,
          persistedCount: 0,
          createdCount: 0,
          updatedCount: 0,
          records: [],
        };
      },
    },
  });

  assert.deepEqual(requests, [{ indicatorCodes: ['dubai', 'usd-krw'] }]);
});

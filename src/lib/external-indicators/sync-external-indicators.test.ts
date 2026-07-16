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
      async loadLatestStates() {
        return [];
      },
      async runSync({ providerResult: received }) {
        assert.deepEqual(received, providerResult);
        return {
          providerKey: received.providerKey,
          acceptedPointCount: received.points.length,
          persistedCount: 1,
          createdCount: 1,
          updatedCount: 0,
          records: [],
          latestStates: [],
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
      async loadLatestStates() {
        return [];
      },
      async runSync() {
        return {
          providerKey: 'test-provider',
          acceptedPointCount: 1,
          persistedCount: 0,
          createdCount: 0,
          updatedCount: 0,
          records: [],
          latestStates: [],
        };
      },
    },
  });

  assert.deepEqual(requests, [{ indicatorCodes: ['dubai', 'usd-krw'] }]);
});

test('syncExternalIndicators persists only points at or after the latest stored observation', async () => {
  const filteredPointDates: string[] = [];

  await syncExternalIndicators({
    indicatorCodes: ['usd-krw'],
    deps: {
      provider: {
        providerKey: 'test-provider',
        supportedIndicatorCodes: externalIndicatorCodes,
        async fetchHistory() {
          return {
            providerKey: 'test-provider',
            points: [
              { indicatorCode: 'usd-krw', observedAt: new Date('2026-07-02T00:00:00.000Z'), value: 1538.05 },
              { indicatorCode: 'usd-krw', observedAt: new Date('2026-07-10T00:00:00.000Z'), value: 1501.06 },
              { indicatorCode: 'usd-krw', observedAt: new Date('2026-07-11T00:00:00.000Z'), value: 1499.01 },
            ],
          };
        },
      },
      async loadLatestStates() {
        return [
          {
            indicatorCode: 'usd-krw',
            observedAt: new Date('2026-07-10T00:00:00.000Z'),
            collectedAt: new Date('2026-07-15T07:48:05.207Z'),
            value: 1501.06,
          },
        ];
      },
      async runSync({ providerResult: received }) {
        filteredPointDates.push(...received.points.map((point) => point.observedAt.toISOString()));
        return {
          providerKey: 'test-provider',
          acceptedPointCount: received.points.length,
          persistedCount: received.points.length,
          createdCount: 1,
          updatedCount: 1,
          records: [],
          latestStates: [],
        };
      },
    },
  });

  assert.deepEqual(filteredPointDates, ['2026-07-10T00:00:00.000Z', '2026-07-11T00:00:00.000Z']);
});

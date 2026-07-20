import assert from 'node:assert/strict';
import test from 'node:test';

import { syncExternalIndicators } from './sync-external-indicators';
import type { ExternalIndicatorProvider } from './provider-contract';

const stateEvents: string[] = [];
const stateWriter = {
  async checking(input: { indicatorCode: string }) {
    stateEvents.push(`checking:${input.indicatorCode}`);
  },
  async succeeded(input: { indicatorCode: string }) {
    stateEvents.push(`succeeded:${input.indicatorCode}`);
  },
  async failed(input: { indicatorCode: string }) {
    stateEvents.push(`failed:${input.indicatorCode}`);
  },
};

function createProvider(input: {
  providerKey: string;
  indicatorCode: 'dubai' | 'usd-krw';
  value?: number;
  fails?: boolean;
  observedAt?: Date;
}): ExternalIndicatorProvider {
  return {
    providerKey: input.providerKey,
    supportedIndicatorCodes: [input.indicatorCode],
    async fetchHistory() {
      if (input.fails) {
        throw new Error(`${input.providerKey} unavailable`);
      }

      return {
        providerKey: input.providerKey,
        points: [
          {
            indicatorCode: input.indicatorCode,
            observedAt: input.observedAt ?? new Date('2026-07-17T00:00:00.000Z'),
            value: input.value ?? 1,
          },
        ],
      };
    },
  };
}

test('syncExternalIndicators refreshes each provider independently', async () => {
  stateEvents.length = 0;
  const runProviders: string[] = [];
  const result = await syncExternalIndicators({
    indicatorCodes: ['dubai', 'usd-krw'],
    deps: {
      providers: [
        createProvider({ providerKey: 'opinet', indicatorCode: 'dubai', value: 76.9 }),
        createProvider({ providerKey: 'fred', indicatorCode: 'usd-krw', value: 1490 }),
      ],
      stateWriter,
      async loadLatestStates() {
        return [];
      },
      async runSync({ providerResult }) {
        runProviders.push(providerResult.providerKey);
        return {
          providerKey: providerResult.providerKey,
          acceptedPointCount: providerResult.points.length,
          persistedCount: providerResult.points.length,
          createdCount: providerResult.points.length,
          updatedCount: 0,
          records: [],
          latestStates: [],
        };
      },
    },
  });

  assert.deepEqual(runProviders, ['opinet', 'fred']);
  assert.deepEqual(result.indicatorStatuses.map(({ indicatorCode, status }) => ({ indicatorCode, status })), [
    { indicatorCode: 'dubai', status: 'succeeded' },
    { indicatorCode: 'usd-krw', status: 'succeeded' },
  ]);
  assert.deepEqual(stateEvents, [
    'checking:dubai',
    'succeeded:dubai',
    'checking:usd-krw',
    'succeeded:usd-krw',
  ]);
});

test('syncExternalIndicators preserves partial success when one provider fails', async () => {
  stateEvents.length = 0;
  const result = await syncExternalIndicators({
    indicatorCodes: ['dubai', 'usd-krw'],
    deps: {
      providers: [
        createProvider({ providerKey: 'opinet', indicatorCode: 'dubai', fails: true }),
        createProvider({ providerKey: 'fred', indicatorCode: 'usd-krw', value: 1490 }),
      ],
      stateWriter,
      async loadLatestStates() {
        return [];
      },
      async runSync({ providerResult }) {
        return {
          providerKey: providerResult.providerKey,
          acceptedPointCount: 1,
          persistedCount: 1,
          createdCount: 1,
          updatedCount: 0,
          records: [],
          latestStates: [],
        };
      },
    },
  });

  assert.equal(result.indicatorStatuses.find((status) => status.indicatorCode === 'dubai')?.status, 'failed');
  assert.equal(result.indicatorStatuses.find((status) => status.indicatorCode === 'usd-krw')?.status, 'succeeded');
  assert.deepEqual(stateEvents, [
    'checking:dubai',
    'failed:dubai',
    'checking:usd-krw',
    'succeeded:usd-krw',
  ]);
});

test('syncExternalIndicators persists only points at or after latest stored observation', async () => {
  const filteredDates: string[] = [];
  const provider: ExternalIndicatorProvider = {
    providerKey: 'fred',
    supportedIndicatorCodes: ['usd-krw'],
    async fetchHistory() {
      return {
        providerKey: 'fred',
        points: [
          { indicatorCode: 'usd-krw', observedAt: new Date('2026-07-02T00:00:00.000Z'), value: 1538.05 },
          { indicatorCode: 'usd-krw', observedAt: new Date('2026-07-10T00:00:00.000Z'), value: 1501.06 },
          { indicatorCode: 'usd-krw', observedAt: new Date('2026-07-11T00:00:00.000Z'), value: 1499.01 },
        ],
      };
    },
  };

  await syncExternalIndicators({
    indicatorCodes: ['usd-krw'],
    deps: {
      provider,
      stateWriter,
      async loadLatestStates() {
        return [
          {
            indicatorCode: 'usd-krw',
            observedAt: new Date('2026-07-10T00:00:00.000Z'),
            collectedAt: new Date('2026-07-15T00:00:00.000Z'),
            value: 1501.06,
          },
        ];
      },
      async runSync({ providerResult }) {
        filteredDates.push(...providerResult.points.map((point) => point.observedAt.toISOString()));
        return {
          providerKey: 'fred',
          acceptedPointCount: providerResult.points.length,
          persistedCount: providerResult.points.length,
          createdCount: 1,
          updatedCount: 1,
          records: [],
          latestStates: [],
        };
      },
    },
  });

  assert.deepEqual(filteredDates, ['2026-07-10T00:00:00.000Z', '2026-07-11T00:00:00.000Z']);
});

test('syncExternalIndicators rejects a provider response older than last-known-good data', async () => {
  stateEvents.length = 0;
  let runSyncCalled = false;
  const result = await syncExternalIndicators({
    indicatorCodes: ['dubai'],
    deps: {
      provider: createProvider({
        providerKey: 'opinet',
        indicatorCode: 'dubai',
        observedAt: new Date('2026-07-17T00:00:00.000Z'),
      }),
      stateWriter,
      async loadLatestStates() {
        return [
          {
            indicatorCode: 'dubai',
            observedAt: new Date('2026-07-18T00:00:00.000Z'),
            collectedAt: new Date('2026-07-19T00:00:00.000Z'),
            value: 77,
          },
        ];
      },
      async runSync() {
        runSyncCalled = true;
        throw new Error('runSync must not execute for regressed source data');
      },
    },
  });

  assert.equal(runSyncCalled, false);
  assert.equal(result.indicatorStatuses[0]?.status, 'failed');
  assert.deepEqual(stateEvents, ['checking:dubai', 'failed:dubai']);
});

import { getOpinetDisplayWeek } from '@/lib/opinet/weekly-period';

import type {
  DashboardTrendDirection,
  FscDashboardForecastChangeSection,
} from './fsc-types';

type ForecastChangeSignalInput = {
  indicatorCode: 'dubai' | 'usd-krw';
  status: 'ready' | 'checking' | 'unavailable';
  direction: DashboardTrendDirection;
};

type ForecastChangeActualWeekInput = {
  weekStartDate: Date | string;
  weekEndDate: Date | string;
};

export type BuildForecastChangeSummaryInput = {
  currentQuarterAverageKrwPerL: number;
  previousQuarterAverageKrwPerL: number | null;
  currentActualWeeks: readonly ForecastChangeActualWeekInput[];
  previousActualWeeks: readonly ForecastChangeActualWeekInput[];
  marketSignals: readonly ForecastChangeSignalInput[];
};

const PRICE_SCALE = 100;

function roundPrice(value: number): number {
  return Math.round(value * PRICE_SCALE) / PRICE_SCALE;
}

function deriveDirection(value: number | null): DashboardTrendDirection {
  if (value === null || value === 0) {
    return 'flat';
  }

  return value > 0 ? 'up' : 'down';
}

function toDateKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function formatActualWeekLabel(week: ForecastChangeActualWeekInput): string | null {
  try {
    const displayWeek = getOpinetDisplayWeek(week.weekStartDate, week.weekEndDate);
    return `${displayWeek.month}월 ${displayWeek.weekOfMonth}주차`;
  } catch {
    return null;
  }
}

function readReadyDirection(
  signals: readonly ForecastChangeSignalInput[],
  indicatorCode: ForecastChangeSignalInput['indicatorCode'],
): DashboardTrendDirection | null {
  const signal = signals.find((candidate) => candidate.indicatorCode === indicatorCode);
  return signal?.status === 'ready' ? signal.direction : null;
}

export function buildForecastChangeReason(input: {
  comparisonAvailable: boolean;
  forecastDirection: DashboardTrendDirection;
  dubaiDirection: DashboardTrendDirection | null;
  usdKrwDirection: DashboardTrendDirection | null;
  hasNewActual: boolean;
}): string {
  const {
    comparisonAvailable,
    forecastDirection,
    dubaiDirection,
    usdKrwDirection,
    hasNewActual,
  } = input;

  if (!comparisonAvailable) {
    return '지난 전망과 비교할 데이터가 없어 변화 원인은 산정하지 않았습니다.';
  }

  if (forecastDirection === 'flat') {
    if (hasNewActual) {
      return '신규 Actual 값을 반영했지만 분기 평균 전망은 유지됐습니다.';
    }

    if (dubaiDirection === 'up' && usdKrwDirection === 'up') {
      return '분기 평균 전망은 유지됐으며 두바이유와 환율은 상승했습니다.';
    }

    if (dubaiDirection === 'down' && usdKrwDirection === 'down') {
      return '분기 평균 전망은 유지됐으며 두바이유와 환율은 하락했습니다.';
    }

    return '분기 평균 예상 유가는 지난 전망과 동일한 수준을 유지했습니다.';
  }

  if (dubaiDirection === 'down' && usdKrwDirection === 'up') {
    return '두바이유 하락 영향이 있었지만 환율 상승이 일부 상쇄했습니다.';
  }

  if (dubaiDirection === 'up' && usdKrwDirection === 'down') {
    return '환율 하락 영향이 있었지만 두바이유 상승이 일부 상쇄했습니다.';
  }

  if (forecastDirection === 'up') {
    if (hasNewActual && dubaiDirection === 'up') {
      return '두바이유 상승과 신규 Actual 값 반영이 이번 전망의 주요 상방 요인입니다.';
    }

    if (hasNewActual && usdKrwDirection === 'up') {
      return '환율 상승과 신규 Actual 값 반영이 이번 전망의 주요 상방 요인입니다.';
    }

    if (hasNewActual) {
      return '신규 Actual 값 반영이 이번 전망 상향에 영향을 주었습니다.';
    }

    if (dubaiDirection === 'up' && usdKrwDirection === 'up') {
      return '두바이유와 환율 상승이 이번 전망의 주요 상방 요인입니다.';
    }

    if (dubaiDirection === 'up') {
      return '두바이유 상승이 이번 전망의 주요 상방 요인입니다.';
    }

    if (usdKrwDirection === 'up') {
      return '환율 상승이 이번 전망의 주요 상방 요인입니다.';
    }

    return '분기 평균 예상 유가가 지난 전망보다 상향됐습니다.';
  }

  if (hasNewActual && dubaiDirection === 'down') {
    return '두바이유 하락과 신규 Actual 값 반영이 이번 전망의 주요 하방 요인입니다.';
  }

  if (hasNewActual && usdKrwDirection === 'down') {
    return '환율 하락과 신규 Actual 값 반영이 이번 전망의 주요 하방 요인입니다.';
  }

  if (hasNewActual) {
    return '신규 Actual 값 반영이 이번 전망 하향에 영향을 주었습니다.';
  }

  if (dubaiDirection === 'down' && usdKrwDirection === 'down') {
    return '두바이유와 환율 하락이 이번 전망의 주요 하방 요인입니다.';
  }

  if (dubaiDirection === 'down') {
    return '두바이유 하락이 이번 전망의 주요 하방 요인입니다.';
  }

  if (usdKrwDirection === 'down') {
    return '환율 하락이 이번 전망의 주요 하방 요인입니다.';
  }

  return '분기 평균 예상 유가가 지난 전망보다 하향됐습니다.';
}

export function buildForecastChangeSummary(
  input: BuildForecastChangeSummaryInput,
): FscDashboardForecastChangeSection {
  const comparisonAvailable = input.previousQuarterAverageKrwPerL !== null;
  const absoluteChangeKrwPerL = comparisonAvailable
    ? roundPrice(input.currentQuarterAverageKrwPerL - input.previousQuarterAverageKrwPerL!)
    : null;
  const direction = deriveDirection(absoluteChangeKrwPerL);
  const previousActualWeekKeys = new Set(
    input.previousActualWeeks
      .map((week) => toDateKey(week.weekEndDate))
      .filter((value): value is string => value !== null),
  );
  const newActualWeeks = comparisonAvailable
    ? input.currentActualWeeks
        .filter((week) => {
          const key = toDateKey(week.weekEndDate);
          return key !== null && !previousActualWeekKeys.has(key);
        })
        .sort((left, right) => {
          const leftTime = new Date(left.weekEndDate).getTime();
          const rightTime = new Date(right.weekEndDate).getTime();
          return leftTime - rightTime;
        })
    : [];
  const latestNewActualWeek = newActualWeeks.at(-1) ?? null;
  const dubaiDirection = readReadyDirection(input.marketSignals, 'dubai');
  const usdKrwDirection = readReadyDirection(input.marketSignals, 'usd-krw');

  return {
    comparisonStatus: comparisonAvailable ? 'available' : 'unavailable',
    previousQuarterAverageKrwPerL: input.previousQuarterAverageKrwPerL,
    currentQuarterAverageKrwPerL: input.currentQuarterAverageKrwPerL,
    absoluteChangeKrwPerL,
    direction,
    summaryText: buildForecastChangeReason({
      comparisonAvailable,
      forecastDirection: direction,
      dubaiDirection,
      usdKrwDirection,
      hasNewActual: newActualWeeks.length > 0,
    }),
    newActualWeekCount: newActualWeeks.length,
    newActualWeekLabel: latestNewActualWeek ? formatActualWeekLabel(latestNewActualWeek) : null,
  };
}

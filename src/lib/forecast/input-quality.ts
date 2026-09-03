import { z } from "zod";

import { DAILY_SIGNAL_LOOKBACK_OBSERVATIONS } from "./forecast-model-config";
import { selectValidDailyObservations } from "./daily-signal";
import type { ForecastIndicatorWeeklySeries } from "./build-weekly-forecast";
import type { ForecastDailyPriceRow, ForecastSeriesPoint } from "./types";

export const FORECAST_INPUT_QUALITY_VERSION = 1;

/** 국내 주간 경유가는 최소 이 개수가 있어야 추세를 계산할 수 있다. */
export const WEEKLY_DIESEL_MIN_POINTS = 3;
/**
 * 소스별 기대 주기. Dubai·USD/KRW는 주 단위로 묶인 시계열을 받으므로 주 기준으로 본다.
 * 주말·휴일 때문에 정상 데이터가 지연으로 보이지 않도록 한 주기의 여유를 둔다.
 */
export const INPUT_MAX_AGE_DAYS = {
  weeklyDiesel: 14,
  dailyDiesel: 6,
  dubai: 14,
  usdKrw: 14,
} as const;

export type DataQualityStatus =
  | "healthy"
  | "stale"
  | "missing"
  | "insufficient"
  | "invalid"
  | "duplicate"
  | "unavailable";

export type ForecastInputSource = "weeklyDiesel" | "dailyDiesel" | "dubai" | "usdKrw";

export interface DataQualityResult {
  source: ForecastInputSource;
  status: DataQualityStatus;
  /** false면 이번 실행에서 해당 입력을 사용하지 않는다. */
  usable: boolean;
  latestDataDate: string | null;
  sampleCount: number;
  /** 내부 코드. 화면 문구는 UI에서 만든다. */
  reasonCode: string | null;
}

export type ForecastInputQualityLevel = "ok" | "attention" | "action-required";

export interface ForecastInputQuality {
  version: number;
  evaluatedAt: string;
  level: ForecastInputQualityLevel;
  results: DataQualityResult[];
  usableInputs: Record<ForecastInputSource, boolean>;
}

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function ageDays(latest: Date, asOf: Date): number {
  return Math.floor((toDateOnly(asOf).getTime() - toDateOnly(latest).getTime()) / 86_400_000);
}

function isUsablePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function result(
  source: ForecastInputSource,
  status: DataQualityStatus,
  usable: boolean,
  latest: Date | null,
  sampleCount: number,
  reasonCode: string | null,
): DataQualityResult {
  return {
    source,
    status,
    usable,
    latestDataDate: latest === null ? null : latest.toISOString(),
    sampleCount,
    reasonCode,
  };
}

/**
 * 국내 주간 경유가는 필수 입력이라 가장 엄격하게 본다.
 * 실제 시장 급등락은 걸러내지 않고, 사용할 수 없는 값만 문제로 본다.
 */
export function evaluateWeeklyDieselQuality(
  weeklySeries: readonly ForecastSeriesPoint[],
  asOf: Date,
): DataQualityResult {
  const asOfTime = toDateOnly(asOf).getTime();
  const future = weeklySeries.filter((point) => toDateOnly(point.targetDate).getTime() > asOfTime);
  const usablePoints = weeklySeries.filter(
    (point) => toDateOnly(point.targetDate).getTime() <= asOfTime && isUsablePrice(point.pointKrwPerL),
  );
  const invalidPoints = weeklySeries.filter(
    (point) => toDateOnly(point.targetDate).getTime() <= asOfTime && !isUsablePrice(point.pointKrwPerL),
  );
  const weekKeys = new Set(usablePoints.map((point) => point.targetDate.toISOString()));
  const latest = usablePoints.reduce<Date | null>(
    (newest, point) => (newest === null || point.targetDate > newest ? point.targetDate : newest),
    null,
  );

  if (usablePoints.length === 0) {
    return result("weeklyDiesel", "missing", false, null, 0, "weekly-diesel-missing");
  }

  if (future.length > 0) {
    return result(
      "weeklyDiesel",
      "invalid",
      false,
      latest,
      usablePoints.length,
      "weekly-diesel-future-row",
    );
  }

  if (invalidPoints.length > 0) {
    return result(
      "weeklyDiesel",
      "invalid",
      false,
      latest,
      usablePoints.length,
      "weekly-diesel-invalid-price",
    );
  }

  if (usablePoints.length < WEEKLY_DIESEL_MIN_POINTS) {
    return result(
      "weeklyDiesel",
      "insufficient",
      false,
      latest,
      usablePoints.length,
      "weekly-diesel-insufficient",
    );
  }

  if (weekKeys.size !== usablePoints.length) {
    return result(
      "weeklyDiesel",
      "duplicate",
      true,
      latest,
      usablePoints.length,
      "weekly-diesel-duplicate-week",
    );
  }

  if (latest !== null && ageDays(latest, asOf) > INPUT_MAX_AGE_DAYS.weeklyDiesel) {
    return result("weeklyDiesel", "stale", true, latest, usablePoints.length, "weekly-diesel-stale");
  }

  return result("weeklyDiesel", "healthy", true, latest, usablePoints.length, null);
}

/** 일별 데이터는 보조 입력이라 부족하면 일별 단기 신호 후보만 제외한다. */
export function evaluateDailyDieselQuality(
  dailyPrices: readonly ForecastDailyPriceRow[],
  asOf: Date,
): DataQualityResult {
  const observations = selectValidDailyObservations(dailyPrices, asOf);
  const latest = observations.at(-1)?.priceDate ?? null;

  if (observations.length === 0) {
    return result("dailyDiesel", "missing", false, null, 0, "daily-diesel-missing");
  }

  if (observations.length < DAILY_SIGNAL_LOOKBACK_OBSERVATIONS) {
    return result(
      "dailyDiesel",
      "insufficient",
      false,
      latest,
      observations.length,
      "daily-diesel-insufficient",
    );
  }

  if (latest !== null && ageDays(latest, asOf) > INPUT_MAX_AGE_DAYS.dailyDiesel) {
    return result("dailyDiesel", "stale", false, latest, observations.length, "daily-diesel-stale");
  }

  return result("dailyDiesel", "healthy", true, latest, observations.length, null);
}

interface IndicatorQualityInput {
  source: Extract<ForecastInputSource, "dubai" | "usdKrw">;
  series: ForecastIndicatorWeeklySeries[keyof ForecastIndicatorWeeklySeries];
  /** 운영·후보 탐색을 통틀어 필요한 최대 lag. 그만큼의 과거 주차가 있어야 보정을 계산할 수 있다. */
  requiredLagWeeks: number;
  asOf: Date;
}

/** Dubai·USD/KRW는 보조 신호라 문제가 있으면 해당 보정만 미사용으로 내린다. */
export function evaluateIndicatorQuality({
  source,
  series,
  requiredLagWeeks,
  asOf,
}: IndicatorQualityInput): DataQualityResult {
  const asOfTime = toDateOnly(asOf).getTime();
  const usable = series.filter(
    (point) =>
      toDateOnly(point.weekEndDate).getTime() <= asOfTime &&
      isUsablePrice(point.value) &&
      !Number.isNaN(point.weekEndDate.getTime()),
  );
  const latest = usable.at(-1)?.weekEndDate ?? null;
  const maxAgeDays = source === "dubai" ? INPUT_MAX_AGE_DAYS.dubai : INPUT_MAX_AGE_DAYS.usdKrw;

  if (usable.length === 0) {
    return result(source, "missing", false, null, 0, `${source}-missing`);
  }

  if (usable.length <= requiredLagWeeks) {
    return result(source, "insufficient", false, latest, usable.length, `${source}-insufficient-lag`);
  }

  if (latest !== null && ageDays(latest, asOf) > maxAgeDays) {
    return result(source, "stale", false, latest, usable.length, `${source}-stale`);
  }

  return result(source, "healthy", true, latest, usable.length, null);
}

export interface BuildForecastInputQualityInput {
  weeklySeries: readonly ForecastSeriesPoint[];
  dailyPrices: readonly ForecastDailyPriceRow[];
  indicatorSeries: ForecastIndicatorWeeklySeries;
  /** 운영과 후보 탐색이 같은 기준을 쓰도록 필요한 최대 lag를 넘긴다. */
  dubaiLagWeeks: number;
  usdKrwLagWeeks: number;
  evaluatedAt: Date;
}

/** 모델 계산 직전에 한 번만 실행한다. 각 모델이 같은 검사를 반복하지 않는다. */
export function buildForecastInputQuality({
  weeklySeries,
  dailyPrices,
  indicatorSeries,
  dubaiLagWeeks,
  usdKrwLagWeeks,
  evaluatedAt,
}: BuildForecastInputQualityInput): ForecastInputQuality {
  const results = [
    evaluateWeeklyDieselQuality(weeklySeries, evaluatedAt),
    evaluateDailyDieselQuality(dailyPrices, evaluatedAt),
    evaluateIndicatorQuality({
      source: "dubai",
      series: indicatorSeries.dubai,
      requiredLagWeeks: dubaiLagWeeks,
      asOf: evaluatedAt,
    }),
    evaluateIndicatorQuality({
      source: "usdKrw",
      series: indicatorSeries.usdKrw,
      requiredLagWeeks: usdKrwLagWeeks,
      asOf: evaluatedAt,
    }),
  ];
  const weekly = results[0];
  // 사용하지 않는 신호는 경고 대상이 아니다. 쓰기로 한 신호가 빠질 때만 주의로 올린다.
  const degraded = results.some(
    (entry) => entry.source !== "weeklyDiesel" && !entry.usable && entry.status !== "unavailable",
  );

  return {
    version: FORECAST_INPUT_QUALITY_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    level: !weekly.usable
      ? "action-required"
      : degraded || weekly.status !== "healthy"
        ? "attention"
        : "ok",
    results,
    usableInputs: {
      weeklyDiesel: weekly.usable,
      dailyDiesel: results[1].usable,
      dubai: results[2].usable,
      usdKrw: results[3].usable,
    },
  };
}

const QualityResultSchema = z.object({
  source: z.enum(["weeklyDiesel", "dailyDiesel", "dubai", "usdKrw"]),
  status: z.enum(["healthy", "stale", "missing", "insufficient", "invalid", "duplicate", "unavailable"]),
  usable: z.boolean(),
  latestDataDate: z.string().nullable(),
  sampleCount: z.number(),
  reasonCode: z.string().nullable(),
});

const InputQualityMetadataSchema = z.object({
  model: z.object({
    inputQuality: z.object({
      version: z.number(),
      evaluatedAt: z.string(),
      level: z.enum(["ok", "attention", "action-required"]),
      results: z.array(QualityResultSchema),
      usableInputs: z.object({
        weeklyDiesel: z.boolean(),
        dailyDiesel: z.boolean(),
        dubai: z.boolean(),
        usdKrw: z.boolean(),
      }),
    }),
  }),
});

/** 과거 run에는 이 블록이 없으므로 null로 정상 동작해야 한다. */
export function readForecastInputQuality(metadata: unknown): ForecastInputQuality | null {
  const parsed = InputQualityMetadataSchema.safeParse(metadata);

  return parsed.success ? parsed.data.model.inputQuality : null;
}

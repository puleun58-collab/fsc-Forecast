import { ForecastHorizonKind } from "@prisma/client";

import { fetchOpinetStatsCsv } from "../opinet/fetch-stats-csv";
import type { ForecastSeriesPoint } from "./types";

interface LoadOpinetQ2FallbackInput {
  year: number;
  fetchImpl?: typeof fetch;
}

export interface OpinetQ2FallbackSeries {
  weeklySeries: ForecastSeriesPoint[];
  monthlySeries: ForecastSeriesPoint[];
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createWeekStartDate(year: number, month: number, week: number): Date {
  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekStart = new Date(firstDayOfMonth);
  firstWeekStart.setUTCDate(firstDayOfMonth.getUTCDate() - firstDayOfMonth.getUTCDay());
  firstWeekStart.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date(firstWeekStart);
  weekStart.setUTCDate(firstWeekStart.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

function createMonthlyStartDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function createMonthlyEndDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

function parseWeeklyLabel(label: string): { year: number; month: number; week: number } {
  const match = label.match(/^(\d{4})년(\d{2})월(\d)주$/);

  if (!match) {
    throw new Error(`Unexpected Opinet weekly label: ${label}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    week: Number(match[3]),
  };
}

function parseMonthlyLabel(label: string): { year: number; month: number } {
  const match = label.match(/^(\d{4})년(\d{2})월$/);

  if (!match) {
    throw new Error(`Unexpected Opinet monthly label: ${label}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

export async function loadOpinetQ2FallbackSeries(
  input: LoadOpinetQ2FallbackInput,
): Promise<OpinetQ2FallbackSeries> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const weeklyRows = await fetchOpinetStatsCsv({
    term: "W",
    startYear: input.year,
    startMonth: 4,
    startWeek: 1,
    endYear: input.year,
    endMonth: 6,
    endWeek: 5,
  }, fetchImpl);
  const monthlyRows = await fetchOpinetStatsCsv({
    term: "M",
    startYear: input.year,
    startMonth: 4,
    endYear: input.year,
    endMonth: 6,
  }, fetchImpl);

  return {
    weeklySeries: weeklyRows.map((row) => {
      const parsed = parseWeeklyLabel(row.label);
      const periodStart = createWeekStartDate(parsed.year, parsed.month, parsed.week);
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCDate(periodStart.getUTCDate() + 6);

      return {
        horizonKind: ForecastHorizonKind.weekly,
        periodStart,
        periodEnd,
        targetDate: periodEnd,
        pointKrwPerL: roundPrice(row.price),
        sampleCount: 1,
      } satisfies ForecastSeriesPoint;
    }),
    monthlySeries: monthlyRows.map((row) => {
      const parsed = parseMonthlyLabel(row.label);
      const periodStart = createMonthlyStartDate(parsed.year, parsed.month);
      const periodEnd = createMonthlyEndDate(parsed.year, parsed.month);

      return {
        horizonKind: ForecastHorizonKind.monthly,
        periodStart,
        periodEnd,
        targetDate: periodEnd,
        pointKrwPerL: roundPrice(row.price),
        sampleCount: 1,
      } satisfies ForecastSeriesPoint;
    }),
  };
}

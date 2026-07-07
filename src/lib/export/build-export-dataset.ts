import { ForecastHorizonKind, RunStatus, type Prisma } from "@prisma/client";

import { buildSeriesSnapshot, NATIONAL_AVERAGE_DATASET_KEY } from "../aggregates";
import { externalIndicatorCatalog } from "../external-indicators/catalog";
import type { BuildExportDatasetResult, ExportDataset, ExportForecastPoint } from "./types";

async function loadDb() {
  const { db } = await import("../db");
  return db;
}


function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function readObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toForecastPoint(point: {
  horizonKind: ForecastHorizonKind;
  horizonIndex: number;
  targetDate: Date;
  pointKrwPerL: Prisma.Decimal;
  lowerBoundKrwPerL: Prisma.Decimal | null;
  upperBoundKrwPerL: Prisma.Decimal | null;
}): ExportForecastPoint {
  return {
    horizonKind: point.horizonKind,
    horizonIndex: point.horizonIndex,
    targetDate: point.targetDate.toISOString(),
    pointKrwPerL: Number(point.pointKrwPerL),
    lowerBoundKrwPerL: point.lowerBoundKrwPerL === null ? null : Number(point.lowerBoundKrwPerL),
    upperBoundKrwPerL: point.upperBoundKrwPerL === null ? null : Number(point.upperBoundKrwPerL),
  };
}

export async function buildExportDataset(): Promise<BuildExportDatasetResult> {
  const db = await loadDb();
  const snapshot = await db.recomputeSnapshot.findFirst({
    where: {
      datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
      status: RunStatus.succeeded,
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      datasetKey: true,
      triggerReason: true,
      currentTruthCutoffAt: true,
      completedAt: true,
    },
  });

  if (!snapshot) {
    return {
      status: "missing_snapshot",
      dataset: null,
    };
  }

  const [dailyRows, forecastRun, evidenceIndicators] = await Promise.all([
    db.dailyPriceCurrent.findMany({
      where: {
        datasetKey: NATIONAL_AVERAGE_DATASET_KEY,
        latestRecomputeSnapshotId: snapshot.id,
      },
      orderBy: {
        priceDate: "asc",
      },
      include: {
        currentRevision: {
          select: {
            observedPriceKrwPerL: true,
          },
        },
      },
    }),
    db.forecastRun.findFirst({
      where: {
        recomputeSnapshotId: snapshot.id,
        status: RunStatus.succeeded,
      },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      include: {
        points: {
          orderBy: [{ horizonKind: "asc" }, { horizonIndex: "asc" }],
        },
      },
    }),
    Promise.all(
      externalIndicatorCatalog.map(async (indicator) => {
        const record = snapshot.currentTruthCutoffAt
          ? await db.externalIndicatorHistory.findFirst({
              where: {
                indicatorCode: indicator.code,
                observedAt: {
                  lte: snapshot.currentTruthCutoffAt,
                },
              },
              orderBy: {
                observedAt: "desc",
              },
            })
          : null;

        return {
          indicatorCode: indicator.code,
          indicatorName: indicator.name,
          unit: indicator.unit,
          status: record ? ("ready" as const) : ("missing" as const),
          observedAt: record ? record.observedAt.toISOString() : null,
          value: record ? Number(record.value) : null,
        };
      }),
    ),
  ]);

  const chartData = buildSeriesSnapshot({
    datasetKey: snapshot.datasetKey,
    currentTruthCutoffAt: snapshot.currentTruthCutoffAt,
    dailyTruth: dailyRows.map((row) => ({
      priceDate: row.priceDate,
      observedPriceKrwPerL: Number(row.currentRevision.observedPriceKrwPerL),
      currentRevisionId: row.currentRevisionId,
      latestRecomputeSnapshotId: row.latestRecomputeSnapshotId,
    })),
  });

  const forecastMetadata = readObject(forecastRun?.metadata ?? null);
  const forecastPoints = (forecastRun?.points ?? []).map(toForecastPoint);
  const dataset: ExportDataset = {
    snapshot: {
      id: snapshot.id,
      datasetKey: snapshot.datasetKey,
      marketScope: "national-average",
      triggerReason: snapshot.triggerReason,
      currentTruthCutoffAt: toIsoString(snapshot.currentTruthCutoffAt),
      completedAt: toIsoString(snapshot.completedAt),
    },
    chartData,
    forecast: {
      status: forecastRun ? "ready" : "missing",
      runId: forecastRun?.id ?? null,
      approvalState: forecastRun?.approvalState ?? null,
      completedAt: toIsoString(forecastRun?.completedAt ?? null),
      backtestWeeks: forecastRun?.backtestWeeks ?? null,
      mapePct: forecastRun?.mapePct === null || forecastRun?.mapePct === undefined ? null : Number(forecastRun.mapePct),
      maeKrwPerL: forecastRun?.maeKrwPerL === null || forecastRun?.maeKrwPerL === undefined ? null : Number(forecastRun.maeKrwPerL),
      degradedReason: readString(forecastMetadata?.degradedReason),
      weeklyPoints: forecastPoints.filter((point) => point.horizonKind === ForecastHorizonKind.weekly),
      monthlyPoints: forecastPoints.filter((point) => point.horizonKind === ForecastHorizonKind.monthly),
    },
    evidenceIndicators,
  };

  return {
    status: "ready",
    dataset,
  };
}

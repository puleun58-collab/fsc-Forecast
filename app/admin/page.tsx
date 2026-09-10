import { redirect } from 'next/navigation';
import type { ComponentProps, ReactNode } from 'react';

import { AdminDataHealthPanel } from '@/components/admin-data-health-panel';
import { AdminForecastDiagnostics, type ForecastRunHistoryEntry } from '@/components/admin-forecast-diagnostics';
import { AdminMarketRegime } from '@/components/admin-market-regime';
import { AdminForecastQualityTrend } from '@/components/admin-forecast-quality-trend';
import { AdminLogoutButton } from '@/components/admin-logout-button';
import { AdminSectionNavigation } from '@/components/admin-section-navigation';
import { AdminParameterSensitivity } from '@/components/admin-parameter-sensitivity';
import { AdminOperationHistory } from '@/components/admin-operation-history';
import { AdminQuarterCard } from '@/components/admin-quarter-card';
import { AdminShadowValidation } from '@/components/admin-shadow-validation';
import { AdminHorizonProfile } from '@/components/admin-horizon-profile';
import { AdminSignalReview } from '@/components/admin-signal-review';
import { AdminTuningTimeline } from '@/components/admin-tuning-timeline';
import { AdminModelTransition } from '@/components/admin-model-transition';
import { AdminOperationsStatus } from '@/components/admin-operations-status';
import { AdminOperationsSummary, resolveNextStep } from '@/components/admin-operations-summary';
import { AdminPostTransition } from '@/components/admin-post-transition';
import { AdminQuarterManagement } from '@/components/admin-quarter-management';
import { AdminWeekComposition } from '@/components/admin-week-composition';
import { getAdminSession } from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { loadAdminDataHealth } from '@/lib/data-health/load-admin-data-health';
import { loadAdminOperationHistory } from '@/lib/admin-operation-history/load-admin-operation-history';
import { loadForecastQualityTrend } from '@/lib/forecast-quality-trend/load-forecast-quality-trend';
import { formatDashboardDateTime } from '@/lib/dashboard/dashboard-time';

import { findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
import { serializeFscResultDto } from '@/lib/fsc/serialize-fsc-dto';
import { readBacktestOneStepPoints } from '@/lib/forecast/backtest-detail';
import { readForecastErrorAnalysis } from '@/lib/forecast/forecast-error-analysis';
import { readCandidatePersistence } from '@/lib/forecast/candidate-persistence';
import { readCandidateRegimeComparisons } from '@/lib/forecast/candidate-regime-comparison';
import { readForecastInputQuality } from '@/lib/forecast/input-quality';
import { formatModelParams } from '@/lib/forecast/describe-model-params';
import { readHorizonPerformance } from '@/lib/forecast/horizon-performance';
import { buildOperationsStatusCenter } from '@/lib/forecast/operations-status';
import { readPerformanceDrift } from '@/lib/forecast/performance-drift';
import { env } from '@/lib/env';
import { readIntervalForwardValidation } from '@/lib/forecast/interval-forward-validation';
import { readPredictionIntervalCalibration } from '@/lib/forecast/prediction-interval';
import { readSignalContribution } from '@/lib/forecast/signal-contribution';
import { readSignalForwardValidation } from '@/lib/forecast/signal-forward-validation';
import { buildSignalReview } from '@/lib/forecast/signal-review';
import { buildTuningTimeline } from '@/lib/forecast/tuning-timeline';
import { readMarketRegimeAnalysis } from '@/lib/forecast/market-regime';
import { readParameterSensitivity } from '@/lib/forecast/parameter-sensitivity';
import { readShadowValidation, summarizeShadowValidation } from '@/lib/forecast/shadow-validation';
import { loadAdminTransitionSection } from '@/lib/forecast/load-model-transition-view';
import {
  explainFirstWeeklyForecast,
  readForecastModelDiagnostics,
  readWeeklyForecastCalculation,
} from '@/lib/forecast/forecast-diagnostics';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function quarterLabel(year: number, quarter: number): string {
  return `${year}년 ${quarter}분기`;
}

function formatQuarterPeriod(start: Date, end: Date): string {
  return `${start.toISOString().slice(0, 10).replaceAll('-', '.')} ~ ${end.toISOString().slice(0, 10).replaceAll('-', '.')}`;
}

function AdminSectionHeader({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <header className="admin-page-section__header">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

type AdminPageView = {
  operatingContext: string;
  operations: {
    status: ComponentProps<typeof AdminOperationsStatus>;
    summary: ComponentProps<typeof AdminOperationsSummary>;
    quarter: ComponentProps<typeof AdminQuarterCard>;
    week: ComponentProps<typeof AdminWeekComposition>;
  };
  diagnostics: {
    dataHealth: ComponentProps<typeof AdminDataHealthPanel>;
    qualityTrend: ComponentProps<typeof AdminForecastQualityTrend>;
    forecast: ComponentProps<typeof AdminForecastDiagnostics>;
    marketRegime: ComponentProps<typeof AdminMarketRegime>;
    horizon: ComponentProps<typeof AdminHorizonProfile>;
    signal: ComponentProps<typeof AdminSignalReview>;
  };
  tuning: {
    sensitivity: ComponentProps<typeof AdminParameterSensitivity>;
    shadow: ComponentProps<typeof AdminShadowValidation>;
    timeline: ComponentProps<typeof AdminTuningTimeline>;
    transition: ComponentProps<typeof AdminModelTransition>;
    postTransition: ComponentProps<typeof AdminPostTransition>;
  };
  management: {
    operationHistory: ComponentProps<typeof AdminOperationHistory>;
    quarterManagement: ComponentProps<typeof AdminQuarterManagement>;
  };
};

function AdminPageSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;

  return (
    <section id={id} className="admin-page-section" aria-labelledby={headingId}>
      <AdminSectionHeader id={headingId} title={title} description={description} />
      <div className="admin-page-section__content">{children}</div>
    </section>
  );
}

function AdminOperationsSection({ view }: { view: AdminPageView['operations'] }) {
  return (
    <AdminPageSection
      id="operations"
      title="운영 현황"
      description="현재 Forecast와 분기 산출 상태를 확인합니다."
    >
      <AdminOperationsStatus {...view.status} />
      <AdminOperationsSummary {...view.summary} />
      <AdminQuarterCard {...view.quarter} />
      <AdminWeekComposition {...view.week} />
    </AdminPageSection>
  );
}

function AdminDiagnosticsSection({ view }: { view: AdminPageView['diagnostics'] }) {
  return (
    <AdminPageSection
      id="diagnostics"
      title="예측 품질·진단"
      description="예측 성능과 데이터·신호 상태를 확인합니다."
    >
      <AdminDataHealthPanel {...view.dataHealth} />
      <AdminForecastQualityTrend {...view.qualityTrend} />
      <AdminForecastDiagnostics {...view.forecast} />
      <AdminMarketRegime {...view.marketRegime} />
      <AdminHorizonProfile {...view.horizon} />
      <AdminSignalReview {...view.signal} />
    </AdminPageSection>
  );
}

function AdminTuningSection({ view }: { view: AdminPageView['tuning'] }) {
  return (
    <AdminPageSection
      id="tuning"
      title="튜닝·검증"
      description="후보 설정과 Shadow 검증 진행 상태를 확인합니다."
    >
      <AdminParameterSensitivity {...view.sensitivity} />
      <AdminShadowValidation {...view.shadow} />
      <AdminTuningTimeline {...view.timeline} />
      <AdminModelTransition {...view.transition} />
      <AdminPostTransition {...view.postTransition} />
    </AdminPageSection>
  );
}

function AdminManagementSection({ view }: { view: AdminPageView['management'] }) {
  return (
    <AdminPageSection
      id="management"
      title="관리·이력"
      description="운영 기록과 분기 설정을 관리합니다."
    >
      <AdminOperationHistory {...view.operationHistory} />
      <AdminQuarterManagement {...view.quarterManagement} />
    </AdminPageSection>
  );
}

function AdminDashboard({ view }: { view: AdminPageView }) {
  return (
    <main id="main-content" className="dashboard-shell admin-grid">
      <section className="dashboard-shell__masthead dashboard-shell__masthead--compact">
        <h1 className="dashboard-shell__title">FSC Admin</h1>
        <div className="admin-row">
          <div className="admin-masthead__copy">
            <p className="dashboard-shell__lead">FSC Forecast 운영 및 데이터 상태를 관리합니다.</p>
            <p className="admin-masthead__context">{view.operatingContext}</p>
          </div>
          <AdminLogoutButton />
        </div>
      </section>

      <AdminSectionNavigation />

      <div className="dashboard-shell__grid">
        <AdminOperationsSection view={view.operations} />
        <AdminDiagnosticsSection view={view.diagnostics} />
        <AdminTuningSection view={view.tuning} />
        <AdminManagementSection view={view.management} />
      </div>
    </main>
  );
}

async function loadAdminPageView(): Promise<AdminPageView> {

  const activeQuarter = await ensureActiveQuarter();
  const [
    quarters,
    activeResult,
    activeResultHistory,
    forecastRuns,
    dataHealth,
    operationHistory,
    qualityTrend,
    transitionSection,
  ] = await Promise.all([
    db.quarterSetting.findMany({
      orderBy: [{ targetYear: 'desc' }, { targetQuarter: 'desc' }],
    }),
    findLatestBaseFscResultByQuarter(activeQuarter.targetYear, activeQuarter.targetQuarter),
    db.fscResult.findMany({
      where: {
        targetYear: activeQuarter.targetYear,
        targetQuarter: activeQuarter.targetQuarter,
        scenarioName: 'base',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        quarterSetting: true,
        sourceRecomputeSnapshot: {
          select: {
            currentTruthCutoffAt: true,
          },
        },
        forecastRun: {
          select: {
            completedAt: true,
          },
        },
        weeks: {
          orderBy: {
            sequenceNo: 'asc',
          },
        },
      },
      take: 2,
    }),
    db.forecastRun.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { id: true, completedAt: true, createdAt: true, metadata: true },
    }),
    loadAdminDataHealth(),
    loadAdminOperationHistory(),
    loadForecastQualityTrend(activeQuarter.targetYear, activeQuarter.targetQuarter),
    loadAdminTransitionSection(),
  ]);

  const activeResultDto = activeResult ? serializeFscResultDto(activeResult) : null;
  const previousResultDto = activeResultHistory[1] ? serializeFscResultDto(activeResultHistory[1]) : null;
  const forecastDiagnosticsEntries: ForecastRunHistoryEntry[] = forecastRuns.flatMap((run) => {
    const diagnostics = readForecastModelDiagnostics(run.metadata);

    return diagnostics === null
      ? []
      : [
          {
            runId: run.id,
            completedAt: (run.completedAt ?? run.createdAt).toISOString(),
            diagnostics,
          },
        ];
  });
  const activeForecastRun =
    activeResult?.forecastRunId === null || activeResult?.forecastRunId === undefined
      ? null
      : (forecastRuns.find((run) => run.id === activeResult.forecastRunId) ?? null);
  const activeForecastDiagnostics =
    activeForecastRun === null ? null : readForecastModelDiagnostics(activeForecastRun.metadata);
  const firstForecastPriceKrwPerL =
    activeResult?.weeks.find(
      (week) => week.priceKind === 'forecast' && week.priceKrwPerL !== null,
    )?.priceKrwPerL ?? null;
  const firstForecastExplanation = explainFirstWeeklyForecast(
    activeForecastRun === null
      ? null
      : readWeeklyForecastCalculation(activeForecastRun.metadata),
    firstForecastPriceKrwPerL?.toString(),
  );


  const latestRunMetadata = forecastRuns[0]?.metadata;
  const persistence = readCandidatePersistence(latestRunMetadata);
  const shadowSession = readShadowValidation(latestRunMetadata);
  const sensitivity = readParameterSensitivity(latestRunMetadata);
  const inputQuality = readForecastInputQuality(latestRunMetadata);
  const horizonPerformance = readHorizonPerformance(latestRunMetadata);
  const performanceDrift = readPerformanceDrift(latestRunMetadata);
  const predictionInterval = readPredictionIntervalCalibration(latestRunMetadata);
  const intervalForwardValidation = readIntervalForwardValidation(latestRunMetadata);
  const signalContribution = readSignalContribution(latestRunMetadata);
  const signalForwardValidation = readSignalForwardValidation(latestRunMetadata);
  const signalReview = buildSignalReview({
    contribution: signalContribution,
    forwardValidation: signalForwardValidation,
    inputQuality,
  });
  // 요약 카드와 자동 튜닝 카드가 같은 진행 단계 판정을 공유한다.
  const tuningTimeline = buildTuningTimeline({
    runs: forecastRuns.map((run) => ({
      id: run.id,
      completedAt: run.completedAt ?? run.createdAt,
      metadata: run.metadata,
    })),
    transitions: transitionSection.transition.history,
  });
  const operationsStatus = buildOperationsStatusCenter({
    hasForecastRun: forecastRuns.length > 0,
    inputQuality,
    performanceDrift,
    persistence,
    shadow: shadowSession,
    transitionStatus: transitionSection.transition.status,
    rollbackReviewable: transitionSection.postTransition?.rollbackApprovable ?? false,
    signalReview,
    horizonPerformance,
    intervalForward: intervalForwardValidation,
    topCandidateLabel:
      sensitivity?.tuningCandidates[0] === undefined
        ? null
        : formatModelParams(sensitivity.tuningCandidates[0].params, { compact: true }),
  });
  const tuningStage = resolveNextStep({
    persistence,
    tuningCandidateCount: sensitivity?.tuningCandidates.length ?? 0,
    shadow: shadowSession,
    transition: transitionSection.transition,
    postTransition: transitionSection.postTransition,
  });
  const currentModelParams = forecastDiagnosticsEntries[0]?.diagnostics.selectedParams ?? null;
  const operatingContext = [
    quarterLabel(activeQuarter.targetYear, activeQuarter.targetQuarter),
    `데이터 기준 시각 ${formatDashboardDateTime(activeResultDto?.dataBasisAt ?? null)}`,
    `현재 Model ${currentModelParams?.modelId ?? '산정 전'}`,
  ].join(' · ');

  return {
    operatingContext,
    operations: {
      status: { center: operationsStatus },
      summary: {
        modelParams: currentModelParams,
        recentMapePct: forecastDiagnosticsEntries[0]?.diagnostics.recentOneStep?.mapePct ?? null,
        recentMaeKrwPerL:
          forecastDiagnosticsEntries[0]?.diagnostics.recentOneStep?.maeKrwPerL ?? null,
        recentSampleCount:
          forecastDiagnosticsEntries[0]?.diagnostics.recentOneStep?.sampleCount ?? null,
        reliabilityGrade: activeResultDto?.reliabilityGrade ?? null,
        drift: performanceDrift,
      },
      quarter: {
        quarterLabel: quarterLabel(activeQuarter.targetYear, activeQuarter.targetQuarter),
        referenceQuarterLabel: quarterLabel(
          activeQuarter.referenceYear,
          activeQuarter.referenceQuarter,
        ),
        periodLabel: formatQuarterPeriod(
          activeQuarter.quarterStartDate,
          activeQuarter.quarterEndDate,
        ),
        result:
          activeResultDto === null
            ? null
            : {
                id: activeResultDto.id,
                approvalStatus: activeResultDto.approvalStatus,
                dataFreshnessStatus: activeResultDto.dataFreshnessStatus,
                reliabilityGrade: activeResultDto.reliabilityGrade,
                reliabilitySampleCount: activeResultDto.reliabilitySampleCount,
                reliabilityMinimumSampleCount: activeResultDto.reliabilityMinimumSampleCount,
                recent13wWeeklyPriceMape: activeResultDto.qualityMetrics.recent13wWeeklyPriceMape,
                actualWeekCount: activeResultDto.actualWeekCount,
                forecastWeekCount: activeResultDto.forecastWeekCount,
                quarterAverageKrwPerL: activeResultDto.quarterAverageKrwPerL,
                previousQuarterAverageKrwPerL:
                  previousResultDto?.quarterAverageKrwPerL ?? null,
              },
      },
      week: {
        actualWeekCount: activeResultDto?.actualWeekCount ?? 0,
        forecastWeekCount: activeResultDto?.forecastWeekCount ?? 0,
        quarterAverageKrwPerL: activeResultDto?.quarterAverageKrwPerL ?? null,
        weeks: activeResultDto?.weeks ?? [],
        forecastBasis:
          activeForecastDiagnostics === null
            ? null
            : {
                modelId: activeForecastDiagnostics.selectedParams.modelId,
                trendLookbackWeeks: activeForecastDiagnostics.selectedParams.trendLookbackWeeks,
                dubai: activeForecastDiagnostics.selectedParams.dubai,
                usdKrw: activeForecastDiagnostics.selectedParams.usdKrw,
                explanation: firstForecastExplanation,
              },
      },
    },
    diagnostics: {
      dataHealth: {
        summary: dataHealth,
        inputQuality,
      },
      qualityTrend: {
        trend: qualityTrend,
        backtestPoints: readBacktestOneStepPoints(forecastRuns[0]?.metadata),
        errorAnalysis: readForecastErrorAnalysis(forecastRuns[0]?.metadata),
      },
      forecast: {
        latest: forecastDiagnosticsEntries[0] ?? null,
        history: forecastDiagnosticsEntries,
        reliability:
          activeResultDto === null
            ? null
            : {
                grade: activeResultDto.reliabilityGrade,
                sampleCount: activeResultDto.reliabilitySampleCount,
                recent13wWeeklyPriceMae:
                  activeResultDto.qualityMetrics.recent13wWeeklyPriceMae === null
                    ? null
                    : Number(activeResultDto.qualityMetrics.recent13wWeeklyPriceMae),
                recent13wWeeklyPriceMape:
                  activeResultDto.qualityMetrics.recent13wWeeklyPriceMape === null
                    ? null
                    : Number(activeResultDto.qualityMetrics.recent13wWeeklyPriceMape),
              },
      },
      marketRegime: {
        analysis: readMarketRegimeAnalysis(forecastRuns[0]?.metadata),
      },
      horizon: {
        performance: horizonPerformance,
        interval: predictionInterval,
        forwardInterval: intervalForwardValidation,
        publicationEnabled: env.predictionIntervalPublic,
      },
      signal: {
        contribution: signalContribution,
        forwardValidation: signalForwardValidation,
        review: signalReview,
      },
    },
    tuning: {
      sensitivity: {
        sensitivity,
        persistence,
        regimeComparisons: readCandidateRegimeComparisons(forecastRuns[0]?.metadata) ?? [],
        stageLabel: tuningStage.label,
        shadowActive:
          shadowSession !== null &&
          summarizeShadowValidation(shadowSession).status === 'validating',
      },
      shadow: { session: shadowSession },
      timeline: { events: tuningTimeline },
      transition: { view: transitionSection.transition },
      postTransition: { view: transitionSection.postTransition },
    },
    management: {
      operationHistory: { events: operationHistory },
      quarterManagement: {
        quarters: quarters.map((quarter) => ({
          id: quarter.id,
          targetYear: quarter.targetYear,
          targetQuarter: quarter.targetQuarter,
          label: quarterLabel(quarter.targetYear, quarter.targetQuarter),
          referenceLabel: quarterLabel(quarter.referenceYear, quarter.referenceQuarter),
          status: quarter.status,
          isActive: quarter.isActive,
        })),
      },
    },
  };
}

export default async function AdminPage() {
  if (getAdminSession() === null) {
    redirect('/admin/login');
  }

  return <AdminDashboard view={await loadAdminPageView()} />;
}

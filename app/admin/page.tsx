import { redirect } from 'next/navigation';

import { AdminDataHealthPanel } from '@/components/admin-data-health-panel';
import { AdminForecastDiagnostics, type ForecastRunHistoryEntry } from '@/components/admin-forecast-diagnostics';
import { AdminMarketRegime } from '@/components/admin-market-regime';
import { AdminForecastQualityTrend } from '@/components/admin-forecast-quality-trend';
import { AdminLogoutButton } from '@/components/admin-logout-button';
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
import { readForecastModelDiagnostics } from '@/lib/forecast/forecast-diagnostics';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function quarterLabel(year: number, quarter: number): string {
  return `${year}년 ${quarter}분기`;
}

function formatQuarterPeriod(start: Date, end: Date): string {
  return `${start.toISOString().slice(0, 10).replaceAll('-', '.')} ~ ${end.toISOString().slice(0, 10).replaceAll('-', '.')}`;
}

export default async function AdminPage() {
  if (getAdminSession() === null) {
    redirect('/admin/login');
  }


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

  return (
    <main id="main-content" className="dashboard-shell admin-grid">
      <section className="dashboard-shell__masthead dashboard-shell__masthead--compact">
        <h1 className="dashboard-shell__title">FSC Admin</h1>
        <div className="admin-row">
          <p className="dashboard-shell__lead">FSC Forecast 운영 및 데이터 상태를 관리합니다.</p>
          <AdminLogoutButton />
        </div>
      </section>

      <div className="dashboard-shell__grid">
        <AdminOperationsStatus center={operationsStatus} />

        <AdminOperationsSummary
          modelParams={forecastDiagnosticsEntries[0]?.diagnostics.selectedParams ?? null}
          recentMapePct={forecastDiagnosticsEntries[0]?.diagnostics.recentOneStep?.mapePct ?? null}
          recentMaeKrwPerL={
            forecastDiagnosticsEntries[0]?.diagnostics.recentOneStep?.maeKrwPerL ?? null
          }
          recentSampleCount={
            forecastDiagnosticsEntries[0]?.diagnostics.recentOneStep?.sampleCount ?? null
          }
          reliabilityGrade={activeResultDto?.reliabilityGrade ?? null}
          drift={performanceDrift}
        />

        <AdminDataHealthPanel
          summary={dataHealth}
          inputQuality={inputQuality}
        />

        <AdminForecastDiagnostics
          latest={forecastDiagnosticsEntries[0] ?? null}
          history={forecastDiagnosticsEntries}
          reliability={
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
                }
          }
        />

        <AdminForecastQualityTrend
          trend={qualityTrend}
          backtestPoints={readBacktestOneStepPoints(forecastRuns[0]?.metadata)}
          errorAnalysis={readForecastErrorAnalysis(forecastRuns[0]?.metadata)}
        />

        <AdminMarketRegime analysis={readMarketRegimeAnalysis(forecastRuns[0]?.metadata)} />

        <AdminParameterSensitivity
          sensitivity={sensitivity}
          persistence={persistence}
          regimeComparisons={readCandidateRegimeComparisons(forecastRuns[0]?.metadata) ?? []}
          stageLabel={tuningStage.label}
          shadowActive={
            shadowSession !== null &&
            summarizeShadowValidation(shadowSession).status === 'validating'
          }
        />

        <AdminHorizonProfile
          performance={horizonPerformance}
          interval={predictionInterval}
          forwardInterval={intervalForwardValidation}
          publicationEnabled={env.predictionIntervalPublic}
        />

        <AdminSignalReview
          contribution={signalContribution}
          forwardValidation={signalForwardValidation}
          review={signalReview}
        />

        <AdminShadowValidation session={shadowSession} />

        <AdminTuningTimeline events={tuningTimeline} />

        <AdminModelTransition view={transitionSection.transition} />

        <AdminPostTransition view={transitionSection.postTransition} />

        <AdminQuarterCard
          quarterLabel={quarterLabel(activeQuarter.targetYear, activeQuarter.targetQuarter)}
          referenceQuarterLabel={quarterLabel(activeQuarter.referenceYear, activeQuarter.referenceQuarter)}
          periodLabel={formatQuarterPeriod(activeQuarter.quarterStartDate, activeQuarter.quarterEndDate)}
          result={
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
                  previousQuarterAverageKrwPerL: previousResultDto?.quarterAverageKrwPerL ?? null,
                }
          }
        />

        <AdminOperationHistory events={operationHistory} />

        <AdminWeekComposition
          actualWeekCount={activeResultDto?.actualWeekCount ?? 0}
          forecastWeekCount={activeResultDto?.forecastWeekCount ?? 0}
          quarterAverageKrwPerL={activeResultDto?.quarterAverageKrwPerL ?? null}
          weeks={activeResultDto?.weeks ?? []}
          forecastBasis={
            forecastDiagnosticsEntries[0]
              ? {
                  modelId: forecastDiagnosticsEntries[0].diagnostics.selectedParams.modelId,
                  trendLookbackWeeks:
                    forecastDiagnosticsEntries[0].diagnostics.selectedParams.trendLookbackWeeks,
                  dubai: forecastDiagnosticsEntries[0].diagnostics.selectedParams.dubai,
                  usdKrw: forecastDiagnosticsEntries[0].diagnostics.selectedParams.usdKrw,
                }
              : null
          }
        />

        <AdminQuarterManagement
          quarters={quarters.map((quarter) => ({
            id: quarter.id,
            targetYear: quarter.targetYear,
            targetQuarter: quarter.targetQuarter,
            label: quarterLabel(quarter.targetYear, quarter.targetQuarter),
            referenceLabel: quarterLabel(quarter.referenceYear, quarter.referenceQuarter),
            status: quarter.status,
            isActive: quarter.isActive,
          }))}
        />
      </div>
    </main>
  );
}

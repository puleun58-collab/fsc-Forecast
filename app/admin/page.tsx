import { redirect } from 'next/navigation';

import { AdminDataHealthPanel } from '@/components/admin-data-health-panel';
import { AdminForecastDiagnostics, type ForecastRunHistoryEntry } from '@/components/admin-forecast-diagnostics';
import { AdminForecastQualityTrend } from '@/components/admin-forecast-quality-trend';
import { AdminLogoutButton } from '@/components/admin-logout-button';
import { AdminParameterSensitivity } from '@/components/admin-parameter-sensitivity';
import { AdminOperationHistory } from '@/components/admin-operation-history';
import { AdminQuarterCard } from '@/components/admin-quarter-card';
import { AdminShadowValidation } from '@/components/admin-shadow-validation';
import { AdminModelTransition } from '@/components/admin-model-transition';
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
import { readParameterSensitivity } from '@/lib/forecast/parameter-sensitivity';
import { loadAdminTransitionSection } from '@/lib/forecast/load-model-transition-view';
import { readShadowValidation } from '@/lib/forecast/shadow-validation';
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
        <AdminDataHealthPanel summary={dataHealth} />

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

        <AdminParameterSensitivity
          sensitivity={readParameterSensitivity(forecastRuns[0]?.metadata)}
        />

        <AdminShadowValidation session={readShadowValidation(forecastRuns[0]?.metadata)} />

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

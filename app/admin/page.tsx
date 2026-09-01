import { redirect } from 'next/navigation';

import { AdminActionButton } from '@/components/admin-action-button';
import { AdminDataHealthPanel } from '@/components/admin-data-health-panel';
import { AdminForecastDiagnostics, type ForecastRunHistoryEntry } from '@/components/admin-forecast-diagnostics';
import { AdminLogoutButton } from '@/components/admin-logout-button';
import { AdminOperationHistory } from '@/components/admin-operation-history';
import { AdminQuarterCard } from '@/components/admin-quarter-card';
import { AdminWeekComposition } from '@/components/admin-week-composition';
import { SectionCard } from '@/components/section-card';
import { getAdminSession } from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { loadAdminDataHealth } from '@/lib/data-health/load-admin-data-health';
import { loadAdminOperationHistory } from '@/lib/admin-operation-history/load-admin-operation-history';

import { findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
import { serializeFscResultDto } from '@/lib/fsc/serialize-fsc-dto';
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
  const [quarters, activeResult, activeResultHistory, forecastRuns, dataHealth, operationHistory] = await Promise.all([
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
  ]);

  const activeResultDto = activeResult ? serializeFscResultDto(activeResult) : null;
  const previousResultDto = activeResultHistory[1] ? serializeFscResultDto(activeResultHistory[1]) : null;
  const nextDraft = quarters.find(
    (quarter) => quarter.status === 'draft' && (quarter.targetYear > activeQuarter.targetYear || (quarter.targetYear === activeQuarter.targetYear && quarter.targetQuarter > activeQuarter.targetQuarter)),
  );
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
      <section className="dashboard-shell__masthead">
        <p className="dashboard-shell__kicker">Authenticated admin</p>
        <h1 className="dashboard-shell__title">FSC Admin</h1>
        <div className="admin-row">
          <p className="dashboard-shell__lead">
            관리자 비밀번호 인증이 완료된 세션에서만 quarter 운영과 FSC 재계산을 수행할 수 있습니다.
          </p>
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
        />


        <SectionCard
          title="Quarter 목록과 draft"
          badge={nextDraft ? `다음 draft ${quarterLabel(nextDraft.targetYear, nextDraft.targetQuarter)}` : 'draft 없음'}
          description="과거 quarter 기록과 활성 전환 가능한 draft를 보여줍니다."
        >
          <ul className="admin-list">
            {quarters.map((quarter) => (
              <li key={quarter.id} className="admin-panel">
                <div className="admin-row">
                  <strong>{quarterLabel(quarter.targetYear, quarter.targetQuarter)}</strong>
                  <span>{quarter.status}{quarter.isActive ? ' · ACTIVE' : ''}</span>
                </div>
                <span>참조 분기 {quarterLabel(quarter.referenceYear, quarter.referenceQuarter)}</span>
                <div className="admin-action">
                  {quarter.status === 'draft' ? (
                    <AdminActionButton
                      label="특정 quarter 활성화"
                      endpoint="/api/fsc/quarter/activate"
                      payload={{ year: quarter.targetYear, quarter: quarter.targetQuarter }}
                      confirmMessage={`${quarterLabel(quarter.targetYear, quarter.targetQuarter)}를 active로 전환합니다. 계속할까요?`}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </main>
  );
}

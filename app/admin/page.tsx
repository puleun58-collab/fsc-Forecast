import { redirect } from 'next/navigation';

import { AdminActionButton } from '@/components/admin-action-button';
import { AdminLogoutButton } from '@/components/admin-logout-button';
import { SectionCard } from '@/components/section-card';
import { getAdminSession } from '@/lib/auth/admin';
import { db } from '@/lib/db';

import { findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
import { serializeFscResultDto } from '@/lib/fsc/serialize-fsc-dto';
import { mapReliabilityStatus } from '@/components/dashboard/dashboard-format';
import { ensureActiveQuarter } from '@/lib/quarter/ensure-active-quarter';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function quarterLabel(year: number, quarter: number): string {
  return `${year}년 ${quarter}분기`;
}

function formatDiff(current: string, previous: string | null): string {
  if (previous === null) {
    return '직전 결과 없음';
  }

  const diff = Number(current) - Number(previous);
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`;
}

function formatMapeSummary(value: string | null): string {
  if (value === null) {
    return '기록 없음';
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(1)}%` : '기록 없음';
}

export default async function AdminPage() {
  if (getAdminSession() === null) {
    redirect('/admin/login');
  }


  const activeQuarter = await ensureActiveQuarter();
  const [quarters, activeResult, activeResultHistory] = await Promise.all([
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
  ]);

  const activeResultDto = activeResult ? serializeFscResultDto(activeResult) : null;
  const previousResultDto = activeResultHistory[1] ? serializeFscResultDto(activeResultHistory[1]) : null;
  const reliabilityStatus = activeResultDto
    ? mapReliabilityStatus({
        grade: activeResultDto.reliabilityGrade,
        sampleCount: activeResultDto.reliabilitySampleCount,
        minimumSampleCount: activeResultDto.reliabilityMinimumSampleCount,
        recent13wWeeklyPriceMape: activeResultDto.qualityMetrics.recent13wWeeklyPriceMape,
      })
    : null;
  const remainingSampleCount = activeResultDto
    ? Math.max(activeResultDto.reliabilityMinimumSampleCount - activeResultDto.reliabilitySampleCount, 0)
    : 0;
  const nextDraft = quarters.find(
    (quarter) => quarter.status === 'draft' && (quarter.targetYear > activeQuarter.targetYear || (quarter.targetYear === activeQuarter.targetYear && quarter.targetQuarter > activeQuarter.targetQuarter)),
  );


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
        <SectionCard
          title="현재 active quarter"
          badge={quarterLabel(activeQuarter.targetYear, activeQuarter.targetQuarter)}
          description="현재 활성 분기와 최신 FSC 상태입니다."
          highlights={[
            `참조 분기 ${quarterLabel(activeQuarter.referenceYear, activeQuarter.referenceQuarter)}`,
            `기간 ${activeQuarter.quarterStartDate.toISOString().slice(0, 10)} ~ ${activeQuarter.quarterEndDate.toISOString().slice(0, 10)}`,
            `상태 ${activeQuarter.status}`,
          ]}
          highlight
        >
          <div className="admin-detail-stack">
            <div className="admin-action">
              <AdminActionButton label="FSC 재계산" endpoint="/api/fsc/recompute" confirmMessage="새 immutable FSC 결과를 생성합니다. 계속할까요?" />
              {activeResultDto ? (
                <AdminActionButton
                  label="기준 시나리오 승인"
                  endpoint="/api/fsc/approve"
                  payload={{ resultId: activeResultDto.id }}
                  confirmMessage={`결과 ${activeResultDto.id}를 승인합니다. 계속할까요?`}
                />
              ) : null}
              <AdminActionButton
                label="수동 rollover"
                endpoint="/api/fsc/quarter/rollover"
                payload={{ force: true }}
                confirmMessage="현재 active quarter를 강제로 다음 분기로 넘깁니다. 계속할까요?"
              />

            </div>
            {activeResultDto ? (
              <div className="admin-detail-stack">
                <div className="admin-metric-grid">
                  {[
                    ['approval', activeResultDto.approvalStatus],
                    ['freshness', activeResultDto.dataFreshnessStatus],
                    ['reliability', reliabilityStatus?.label ?? activeResultDto.reliabilityGrade],
                    ['actual weeks', String(activeResultDto.actualWeekCount)],
                    ['forecast weeks', String(activeResultDto.forecastWeekCount)],
                    ['quarter average', activeResultDto.quarterAverageKrwPerL],
                    ['FSC 30%', activeResultDto.fscLowKrwPerL],
                    ['FSC 70%', activeResultDto.fscHighKrwPerL],
                  ].map(([label, value]) => (
                    <div key={label} className="admin-metric">
                      <span className="dashboard-shell__metric-label">{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="admin-panel">
                  <strong>직전 결과 대비</strong>
                  <span>quarter average 변화: {formatDiff(activeResultDto.quarterAverageKrwPerL, previousResultDto?.quarterAverageKrwPerL ?? null)}</span>
                  <span>FSC 30% 변화: {formatDiff(activeResultDto.fscLowKrwPerL, previousResultDto?.fscLowKrwPerL ?? null)}</span>
                  <span>FSC 70% 변화: {formatDiff(activeResultDto.fscHighKrwPerL, previousResultDto?.fscHighKrwPerL ?? null)}</span>
                </div>
                <div className="admin-panel">
                  <strong>Reliability 상세</strong>
                  <span>유효 백테스트 수: {activeResultDto.reliabilitySampleCount}</span>
                  <span>최소 필요 백테스트 수: {activeResultDto.reliabilityMinimumSampleCount}</span>
                  <span>추가로 필요한 백테스트 수: {remainingSampleCount}</span>
                  {remainingSampleCount > 0 || activeResultDto.reliabilityGrade === 'U' || activeResultDto.qualityMetrics.recent13wWeeklyPriceMape === null ? (
                    <>
                      <span>공식 등급 미산정</span>
                      <span>주간 백테스트 {activeResultDto.reliabilitySampleCount}/{activeResultDto.reliabilityMinimumSampleCount}개 확보</span>
                      <span>{remainingSampleCount}개가 추가로 필요합니다.</span>
                    </>
                  ) : (
                    <>
                      <span>공식 신뢰도 {activeResultDto.reliabilityGrade}</span>
                      <span>최근 13개 백테스트 MAPE {formatMapeSummary(activeResultDto.qualityMetrics.recent13wWeeklyPriceMape)}</span>
                    </>
                  )}
                  <span>4주 MAE: {activeResultDto.qualityMetrics.recent4wWeeklyPriceMae ?? '기록 없음'}</span>
                  <span>13주 MAE: {activeResultDto.qualityMetrics.recent13wWeeklyPriceMae ?? '기록 없음'}</span>
                  <span>13주 MAPE: {activeResultDto.qualityMetrics.recent13wWeeklyPriceMape ?? '기록 없음'}</span>
                  <span>13주 방향 정확도: {activeResultDto.qualityMetrics.recent13wDirectionAccuracy ?? '기록 없음'}</span>
                  <span>26주 MAE: {activeResultDto.qualityMetrics.recent26wWeeklyPriceMae ?? '기록 없음'}</span>
                  <span>4주 bias: {activeResultDto.qualityMetrics.forecastBias4w ?? '기록 없음'}</span>
                  <span>13주 bias: {activeResultDto.qualityMetrics.forecastBias13w ?? '기록 없음'}</span>
                </div>
              </div>
            ) : (
              <div className="section-card__placeholder">
                <span className="section-card__placeholder-title">아직 active quarter FSC 결과가 없습니다.</span>
                <span className="section-card__placeholder-copy">FSC 재계산을 실행하면 최신 기준 시나리오가 표시됩니다.</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="actual/forecast 주차"
          badge={activeResultDto ? `${activeResultDto.weeks.length}개 주차` : '결과 없음'}
          description="actual/forecast 구분과 fallback source를 개발용 상세로 확인합니다."
        >
          {activeResultDto ? (
            <ul className="admin-list">
              {activeResultDto.weeks.map((week) => (
                <li key={week.sequenceNo} className="admin-panel">
                  <strong>
                    {week.sequenceNo}주차 · {week.weekStartDate.slice(0, 10)} ~ {week.weekEndDate.slice(0, 10)}
                  </strong>
                  <span>
                    {week.priceKind} · {week.priceKrwPerL}원/L · source {week.forecastSourceKind ?? 'actual'}
                    {week.fallbackUsed ? ' · fallback' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>

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

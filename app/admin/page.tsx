import { redirect } from 'next/navigation';

import { AdminActionButton } from '@/components/admin-action-button';
import { AdminLogoutButton } from '@/components/admin-logout-button';
import { SectionCard } from '@/components/section-card';
import { getAdminSession } from '@/lib/auth/admin';
import { db } from '@/lib/db';
import { buildFscExportDataset } from '@/lib/fsc/build-fsc-export-dataset';
import { findLatestBaseFscResultByQuarter } from '@/lib/fsc/load-latest-fsc-result';
import { serializeFscResultDto } from '@/lib/fsc/serialize-fsc-dto';
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
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(3)}`;
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
  const nextDraft = quarters.find(
    (quarter) => quarter.status === 'draft' && (quarter.targetYear > activeQuarter.targetYear || (quarter.targetYear === activeQuarter.targetYear && quarter.targetQuarter > activeQuarter.targetQuarter)),
  );
  const activeExport = await buildFscExportDataset({ year: activeQuarter.targetYear, quarter: activeQuarter.targetQuarter });

  return (
    <main className="dashboard-shell" style={{ display: 'grid', gap: 24 }}>
      <section className="dashboard-shell__hero" style={{ display: 'grid', gap: 16 }}>
        <p className="dashboard-shell__eyebrow">Authenticated admin</p>
        <h1 className="dashboard-shell__title">FSC Admin</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <p className="dashboard-shell__lead" style={{ margin: 0 }}>
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
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
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
              <a
                href={`/export/fsc-quarter/xlsx?year=${activeQuarter.targetYear}&quarter=${activeQuarter.targetQuarter}`}
                style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 12, textDecoration: 'none', color: 'var(--text)', fontWeight: 700, background: activeExport.status === 'ready' ? 'white' : '#f4f6f8' }}
              >
                분기별 FSC XLSX 다운로드
              </a>
            </div>
            {activeResultDto ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {[
                    ['approval', activeResultDto.approvalStatus],
                    ['freshness', activeResultDto.dataFreshnessStatus],
                    ['reliability', activeResultDto.reliabilityGrade],
                    ['actual weeks', String(activeResultDto.actualWeekCount)],
                    ['forecast weeks', String(activeResultDto.forecastWeekCount)],
                    ['quarter average', activeResultDto.quarterAverageKrwPerL],
                    ['FSC 30%', activeResultDto.fscLowKrwPerL],
                    ['FSC 70%', activeResultDto.fscHighKrwPerL],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'grid', gap: 6, padding: 16, border: '1px solid var(--border)', borderRadius: 16, background: 'rgba(255,255,255,0.8)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 8, padding: 16, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface-muted)' }}>
                  <strong>직전 결과 대비</strong>
                  <span>quarter average 변화: {formatDiff(activeResultDto.quarterAverageKrwPerL, previousResultDto?.quarterAverageKrwPerL ?? null)}</span>
                  <span>FSC 30% 변화: {formatDiff(activeResultDto.fscLowKrwPerL, previousResultDto?.fscLowKrwPerL ?? null)}</span>
                  <span>FSC 70% 변화: {formatDiff(activeResultDto.fscHighKrwPerL, previousResultDto?.fscHighKrwPerL ?? null)}</span>
                </div>
                <div style={{ display: 'grid', gap: 8, padding: 16, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface-muted)' }}>
                  <strong>Reliability 상세</strong>
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
              <div style={{ padding: 16, border: '1px dashed var(--border)', borderRadius: 16 }}>아직 active quarter FSC 결과가 없습니다.</div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="actual/forecast 주차"
          badge={activeResultDto ? `${activeResultDto.weeks.length}개 주차` : '결과 없음'}
          description="actual/forecast 구분과 fallback source를 개발용 상세로 확인합니다."
        >
          {activeResultDto ? (
            <ul style={{ display: 'grid', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
              {activeResultDto.weeks.map((week) => (
                <li key={week.sequenceNo} style={{ display: 'grid', gap: 8, padding: 16, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface-muted)' }}>
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
          <ul style={{ display: 'grid', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
            {quarters.map((quarter) => (
              <li key={quarter.id} style={{ display: 'grid', gap: 8, padding: 16, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{quarterLabel(quarter.targetYear, quarter.targetQuarter)}</strong>
                  <span>{quarter.status}{quarter.isActive ? ' · ACTIVE' : ''}</span>
                </div>
                <span>참조 분기 {quarterLabel(quarter.referenceYear, quarter.referenceQuarter)}</span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {quarter.status === 'draft' ? (
                    <AdminActionButton
                      label="특정 quarter 활성화"
                      endpoint="/api/fsc/quarter/activate"
                      payload={{ year: quarter.targetYear, quarter: quarter.targetQuarter }}
                      confirmMessage={`${quarterLabel(quarter.targetYear, quarter.targetQuarter)}를 active로 전환합니다. 계속할까요?`}
                    />
                  ) : null}
                  <a
                    href={`/export/fsc-quarter/xlsx?year=${quarter.targetYear}&quarter=${quarter.targetQuarter}`}
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 12, textDecoration: 'none', color: 'var(--text)', fontWeight: 700, background: 'white' }}
                  >
                    분기 XLSX
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </main>
  );
}

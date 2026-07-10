import type { CSSProperties, ReactNode } from 'react';

import { PriceTrendChart } from './price-trend-chart';
import { SectionCard } from './section-card';
import type { DashboardData, DashboardExportItem, DashboardSummaryValue } from '@/lib/dashboard/types';

type DashboardShellProps = {
  data: DashboardData;
};

const panelStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
};

const summaryCardStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: 16,
  border: '1px solid var(--border)',
  borderRadius: 16,
  background: 'rgba(255, 255, 255, 0.8)',
};

const labelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.84rem',
};

const valueStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const blockStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 16,
  border: '1px solid var(--border)',
  borderRadius: 16,
  background: 'var(--surface-muted)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: 8,
};

function formatTimestamp(value: string | null): string {
  return value ?? '기록 없음';
}

function formatPrice(value: number | null): string {
  return value === null ? '데이터 없음' : `${value.toFixed(3)}원/L`;
}

function formatPercent(value: number | null): string {
  return value === null ? '비교 불가' : `${value > 0 ? '+' : ''}${value.toFixed(3)}%`;
}

function getToneColor(tone: DashboardSummaryValue['tone']): string {
  switch (tone) {
    case 'positive':
      return 'var(--status)';
    case 'negative':
      return '#b42318';
    case 'muted':
      return 'var(--text-muted)';
    case 'default':
    case undefined:
      return 'var(--text)';
  }
}

function renderUnavailable(title: string, copy: string): ReactNode {
  return (
    <div className="section-card__placeholder" aria-label={title}>
      <span className="section-card__placeholder-title">{title}</span>
      <span className="section-card__placeholder-copy">{copy}</span>
    </div>
  );
}

function renderExportItem(item: DashboardExportItem): ReactNode {
  const href = `/export/${item.format}`;

  return (
    <li key={item.format} style={blockStyle}>
      <div style={rowStyle}>
        <strong>{item.format.toUpperCase()}</strong>
        <span style={{ color: item.availability === 'available' ? 'var(--status)' : 'var(--text-muted)' }}>
          {item.availability === 'available' ? '다운로드 가능' : '준비 전'}
        </span>
      </div>
      <span style={labelStyle}>완료 시각: {formatTimestamp(item.completedAt)}</span>
      <span style={labelStyle}>저장 키: {item.storageKey ?? '기록 없음'}</span>
      <a href={href} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
        XLSX 다운로드
      </a>
      {item.unavailableReason ? <span style={labelStyle}>{item.unavailableReason}</span> : null}
    </li>
  );
}

export function DashboardShell({ data }: DashboardShellProps) {
  if (data.availability === 'unavailable') {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-shell__hero">
          <p className="dashboard-shell__eyebrow">FSC calculation MVP</p>
          <h1 className="dashboard-shell__title">FSC Forecast Dashboard</h1>
          <p className="dashboard-shell__description">
            공개 범위는 전국 평균 자동차용 경유가만 유지합니다. 현재는 데이터베이스 기반 공개 데이터를 읽을 수 없어
            대시보드 전체를 비가용 상태로 노출합니다.
          </p>
        </section>
        {renderUnavailable(data.unavailable.reason, data.unavailable.detail)}
      </main>
    );
  }

  const forecastBadge =
    data.forecast.availability === 'available'
      ? data.forecast.approvalState === 'approved'
        ? '품질 게이트 통과'
        : data.forecast.approvalState === 'degraded'
          ? '저신뢰 공개'
          : '대기 상태'
      : '데이터 없음';

  const commentaryBadge =
    data.commentary.status === 'ready'
      ? '규칙 기반 해설'
      : data.commentary.status === 'insufficient_data'
        ? '근거 부족'
        : '데이터 없음';

  return (
    <main className="dashboard-shell">
      <section className="dashboard-shell__hero">
        <p className="dashboard-shell__eyebrow">FSC calculation MVP</p>
        <h1 className="dashboard-shell__title">FSC Forecast Dashboard</h1>
        <p className="dashboard-shell__description">
          최신 current truth와 성공한 recompute snapshot 기준으로 전국 평균 자동차용 경유가만 공개합니다. 지역별 수치,
          추정치 보정, 임의 대체값은 표시하지 않습니다.
        </p>
        <div className="dashboard-shell__meta" aria-label="대시보드 기준 정보">
          <span className="dashboard-shell__meta-item">범위: {data.marketScope}</span>
          <span className="dashboard-shell__meta-item">데이터셋: {data.datasetKey}</span>
          <span className="dashboard-shell__meta-item">스냅샷: {data.snapshot.snapshotId}</span>
          <span className="dashboard-shell__meta-item">컷오프: {formatTimestamp(data.snapshot.currentTruthCutoffAt)}</span>
        </div>
      </section>

      <div className="dashboard-shell__grid">
        <SectionCard
          title="현재 유가 및 FSC 기준"
          badge="현재 진실값"
          description="최신 스냅샷에 연결된 전국 평균 자동차용 경유가 현황입니다."
          highlights={[
            `기준일 ${data.status.latestPriceDate}`,
            `커버리지 ${data.status.coverageStartDate ?? '없음'} ~ ${data.status.coverageEndDate ?? '없음'}`,
            `현재 revision ${data.status.currentRevisionId}`,
          ]}
          highlight
        >
          <div style={panelStyle}>
            <div style={summaryGridStyle}>
              {data.summaryValues.map((item) => (
                <div key={item.label} style={summaryCardStyle}>
                  <span style={labelStyle}>{item.label}</span>
                  <p style={{ ...valueStyle, color: getToneColor(item.tone) }}>{item.value}</p>
                </div>
              ))}
            </div>
            <div style={blockStyle}>
              <div style={rowStyle}>
                <span style={labelStyle}>직전 기준일</span>
                <strong>{data.status.previousPriceDate ?? '없음'}</strong>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>직전 가격</span>
                <strong>{formatPrice(data.status.previousPriceKrwPerL)}</strong>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>전일 변동률</span>
                <strong>{formatPercent(data.status.percentChange)}</strong>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>원천 관측 시각</span>
                <strong>{formatTimestamp(data.status.sourceObservedAt)}</strong>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="전국 평균 추이 차트"
          badge="스냅샷 읽기 전용"
          description="최신 스냅샷에 묶인 최근 30일 전국 평균 경유가 추이입니다."
          highlights={[
            `최신 주간 평균 ${formatPrice(data.trend.latestWeeklyAverageKrwPerL)}`,
            `최신 월간 평균 ${formatPrice(data.trend.latestMonthlyAverageKrwPerL)}`,
            '부분 갱신값이 아니라 동일 스냅샷 기준 데이터만 표시합니다.',
          ]}
        >
          <PriceTrendChart points={data.trend.points} unavailableReason={data.trend.unavailableReason} />
        </SectionCard>

        <SectionCard
          title="유가 예측 및 FSC 기준 시나리오"
          badge={forecastBadge}
          description="성공한 forecast run이 있으면 최신 스냅샷 기준 주간 4포인트, 월간 3포인트를 그대로 노출합니다."
          highlights={[
            data.forecast.generatedAt ? `생성 시각 ${data.forecast.generatedAt}` : '생성 시각 기록 없음',
            data.forecast.mapePct === null ? 'MAPE 기록 없음' : `MAPE ${data.forecast.mapePct.toFixed(3)}%`,
            data.forecast.maeKrwPerL === null ? 'MAE 기록 없음' : `MAE ${data.forecast.maeKrwPerL.toFixed(3)}원/L`,
          ]}
        >
          {data.forecast.availability === 'available' ? (
            <div style={panelStyle}>
              {data.forecast.degradedReason ? (
                <div style={blockStyle}>
                  <strong>품질 게이트 메모</strong>
                  <span style={labelStyle}>{data.forecast.degradedReason}</span>
                </div>
              ) : null}
              <div style={summaryGridStyle}>
                {[...data.forecast.weeklyPoints, ...data.forecast.monthlyPoints].map((point) => (
                  <div key={`${point.horizonKind}-${point.horizonIndex}`} style={summaryCardStyle}>
                    <span style={labelStyle}>
                      {point.horizonKind === 'weekly' ? `주간 +${point.horizonIndex}` : `월간 +${point.horizonIndex}`}
                    </span>
                    <p style={valueStyle}>{formatPrice(point.pointKrwPerL)}</p>
                    <span style={labelStyle}>목표일 {point.targetDate}</span>
                    <span style={labelStyle}>
                      구간 {formatPrice(point.lowerBoundKrwPerL)} ~ {formatPrice(point.upperBoundKrwPerL)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            renderUnavailable('예측 데이터 사용 불가', data.forecast.unavailableReason ?? '예측 실행 기록이 없습니다.')
          )}
        </SectionCard>

        <SectionCard
          title="해설 블록"
          badge={commentaryBadge}
          description="Dubai·Brent·WTI·USD/KRW 최근 관측치를 근거로 같은 스냅샷 컷오프 안에서 규칙 기반 해설을 생성합니다."
          highlights={[
            data.commentary.generatedAt ? `생성 시각 ${data.commentary.generatedAt}` : '생성 시각 기록 없음',
            'LLM 없이 규칙 기반 해설만 사용합니다.',
            '근거 지표가 부족하면 부족하다고 그대로 노출합니다.',
          ]}
        >
          {data.commentary.text ? (
            <div style={panelStyle}>
              <div style={blockStyle}>
                <strong>해설</strong>
                <span style={{ lineHeight: 1.7 }}>{data.commentary.text}</span>
              </div>
              <ul style={listStyle}>
                {data.commentary.signals.map((signal) => (
                  <li key={signal.indicatorCode} style={blockStyle}>
                    <strong>{signal.indicatorCode}</strong>
                    <span style={labelStyle}>{signal.reasonText}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            renderUnavailable('해설 데이터 사용 불가', data.commentary.unavailableReason ?? '해설을 생성하지 못했습니다.')
          )}
        </SectionCard>

        <SectionCard
          title="FSC 산출표 다운로드"
          badge="스냅샷 고정"
          description="최신 성공 스냅샷에 연결된 XLSX 내보내기 실행 기록만 공개합니다."
          highlights={[
            `기준 snapshot ${data.exports.snapshotId ?? '없음'}`,
            'XLSX 다운로드만 같은 스냅샷 식별자에 묶어서 공개합니다.',
            '실행 기록이 없으면 준비되지 않았다고 그대로 표시합니다.',
          ]}
        >
          <ul style={listStyle}>{data.exports.items.map((item) => renderExportItem(item))}</ul>
        </SectionCard>
      </div>
    </main>
  );
}

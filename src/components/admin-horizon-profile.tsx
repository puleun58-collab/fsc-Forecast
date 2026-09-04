import { AdminDisclosureToggle } from './admin-disclosure-toggle';
import { SectionCard } from './section-card';

import { formatPriceText } from '@/lib/dashboard/display-format';
import type {
  HorizonBandKey,
  HorizonPerformance,
  HorizonPerformanceEntry,
  HorizonStatus,
} from '@/lib/forecast/horizon-performance';
import {
  summarizeIntervalForwardValidation,
  type IntervalForwardValidation,
  type IntervalPublicationStatus,
} from '@/lib/forecast/interval-forward-validation';
import type {
  PredictionIntervalCalibration,
  PredictionIntervalHorizon,
  PredictionIntervalSource,
  PredictionIntervalStatus,
} from '@/lib/forecast/prediction-interval';

const REPRESENTATIVE_HORIZONS = [1, 4, 8, 13];

const HORIZON_STATUS_LABEL: Record<HorizonStatus, string> = {
  stable: '안정',
  watch: '관찰',
  volatile: '변동 큼',
  'insufficient-sample': '표본 부족',
};

const BAND_LABEL: Record<HorizonBandKey, string> = {
  near: '단기',
  mid: '중기',
  long: '장기',
};

const INTERVAL_STATUS_VIEW: Record<PredictionIntervalStatus, { label: string; className: string }> = {
  calibrated: { label: '적정', className: 'status-tag--ok' },
  'too-narrow': { label: '범위 좁음', className: 'status-tag--warning' },
  'too-wide': { label: '범위 넓음', className: '' },
  validating: { label: '검증 중', className: '' },
  'insufficient-sample': { label: '산정 전', className: '' },
};

const INTERVAL_SOURCE_LABEL: Record<PredictionIntervalSource, string> = {
  horizon: '해당 예측 거리 표본',
  band: '인접 구간 표본',
  pooled: '전체 예측 거리 표본',
  none: '표본 없음',
};

function formatMae(value: number | null): string {
  return value === null ? '산정 전' : formatPriceText(value);
}

function formatPercent(value: number | null, digits = 2): string {
  return value === null ? '산정 전' : `${value.toFixed(digits)}%`;
}

function formatRatio(value: number | null): string {
  return value === null ? '산정 전' : `${(value * 100).toFixed(1)}%`;
}

function describeHorizon(horizonWeeks: number): string {
  return `${horizonWeeks}주 후`;
}

const PUBLICATION_LABEL: Record<IntervalPublicationStatus, string> = {
  eligible: '공개 가능',
  pending: '대기',
};

export function AdminHorizonProfile({
  performance,
  interval,
  forwardInterval = null,
  publicationEnabled = false,
}: {
  performance: HorizonPerformance | null;
  interval: PredictionIntervalCalibration | null;
  /** 실제 발행된 범위의 적중 검증 결과. 기능 적용 이전 run에서는 null이다. */
  forwardInterval?: IntervalForwardValidation | null;
  publicationEnabled?: boolean;
}) {
  if (performance === null) {
    return (
      <SectionCard
        title="예측 기간별 성능"
        badge="이력 없음"
        description="1주 후부터 13주 후까지 예측 거리별로 실제 성능을 비교합니다."
        className="admin-horizon-profile"
        emptyStateTitle="예측 기간별 성능 이력 없음"
        emptyStateCopy="다음 예측 실행부터 예측 거리별 성능이 기록됩니다."
      />
    );
  }

  const byHorizon = new Map(performance.horizons.map((entry) => [entry.horizonWeeks, entry]));
  const representatives = REPRESENTATIVE_HORIZONS.flatMap((horizonWeeks) => {
    const entry = byHorizon.get(horizonWeeks);

    return entry === undefined ? [] : [entry];
  });
  const intervalByHorizon = new Map(
    (interval?.horizons ?? []).map((entry) => [entry.horizonWeeks, entry]),
  );
  const forwardSummaries = summarizeIntervalForwardValidation(forwardInterval);

  return (
    <SectionCard
      title="예측 기간별 성능"
      badge={`평가 ${performance.horizons.length}개 구간`}
      description="1주 후부터 13주 후까지 예측 거리별 정확도와 예상 범위 적중률을 확인합니다. 진단용이며 모델 선택·신뢰도에는 사용하지 않습니다."
      className="admin-horizon-profile"
    >
      <div className="admin-detail-stack">
        <div className="admin-metric-grid">
          {representatives.map((entry) => (
            <div key={entry.horizonWeeks} className="admin-metric">
              <span className="dashboard-shell__metric-label">{describeHorizon(entry.horizonWeeks)}</span>
              <strong>MAE {formatMae(entry.maeKrwPerL)}</strong>
              <span className="horizon-profile__sample">
                평가 {entry.sampleCount}개 · {HORIZON_STATUS_LABEL[entry.status]}
              </span>
            </div>
          ))}
        </div>
        <p className="admin-decision__note">
          {performance.degradationStartHorizonWeeks === null
            ? '명확한 저하 구간 없음'
            : `${performance.degradationStartHorizonWeeks}주 이후 오차 증가`}
        </p>

        <div className="admin-panel">
          <strong>구간 평균</strong>
          <ul className="horizon-profile__bands">
            {performance.bands.map((band) => (
              <li key={band.band}>
                <span>
                  {BAND_LABEL[band.band]} {band.fromHorizonWeeks}~{band.toHorizonWeeks}주
                </span>
                <strong>MAE {formatMae(band.maeKrwPerL)}</strong>
              </li>
            ))}
          </ul>
        </div>

        <details className="admin-panel admin-disclosure">
          <summary className="admin-disclosure__summary">
            <strong>예측 기간별 상세 보기</strong>
            <AdminDisclosureToggle />
          </summary>
          <div className="admin-disclosure__body">
            <div className="admin-table-wrap">
              <table className="admin-table horizon-profile-table">
                <thead>
                  <tr>
                    <th scope="col">예측 거리</th>
                    <th scope="col">표본</th>
                    <th scope="col">MAE</th>
                    <th scope="col">MAPE</th>
                    <th scope="col">최대 오차</th>
                    <th scope="col">방향 정확도</th>
                    <th scope="col">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.horizons.map((entry: HorizonPerformanceEntry) => (
                    <tr key={entry.horizonWeeks}>
                      <th scope="row" data-label="예측 거리">
                        {describeHorizon(entry.horizonWeeks)}
                      </th>
                      <td data-label="표본">{entry.sampleCount}개</td>
                      <td data-label="MAE">{formatMae(entry.maeKrwPerL)}</td>
                      <td data-label="MAPE">{formatPercent(entry.mapePct)}</td>
                      <td data-label="최대 오차">{formatMae(entry.maxAbsoluteErrorKrwPerL)}</td>
                      <td data-label="방향 정확도">{formatRatio(entry.directionAccuracyRatio)}</td>
                      <td data-label="상태">{HORIZON_STATUS_LABEL[entry.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <div className="admin-panel">
          <strong>예측 범위 적중률</strong>
          <p className="admin-decision__note">
            과거 실제 오차를 이용해 예측 거리별 예상 범위를 계산하고 실제값이 범위 안에 들어왔는지
            검증합니다. 목표 {interval === null ? '산정 전' : formatRatio(interval.targetCoverage)}.
          </p>
          {interval === null || interval.horizons.length === 0 ? (
            <p className="backtest-detail__empty">예측 범위 검증 이력이 없습니다.</p>
          ) : (
            <>
              <ul className="horizon-profile__bands">
                {REPRESENTATIVE_HORIZONS.flatMap((horizonWeeks) => {
                  const entry = intervalByHorizon.get(horizonWeeks);

                  return entry === undefined ? [] : [entry];
                }).map((entry: PredictionIntervalHorizon) => (
                  <li key={entry.horizonWeeks}>
                    <span>{describeHorizon(entry.horizonWeeks)}</span>
                    <strong>
                      {entry.status === 'insufficient-sample'
                        ? '산정 전'
                        : formatRatio(entry.coverageRatio)}{' '}
                      · {INTERVAL_STATUS_VIEW[entry.status].label}
                    </strong>
                  </li>
                ))}
              </ul>
              <details className="admin-disclosure admin-disclosure--inline">
                <summary className="admin-disclosure__summary">
                  <span>예측 범위 상세 보기</span>
                  <AdminDisclosureToggle />
                </summary>
                <div className="admin-disclosure__body">
                  <div className="admin-table-wrap">
                    <table className="admin-table horizon-profile-table">
                      <thead>
                        <tr>
                          <th scope="col">예측 거리</th>
                          <th scope="col">표본</th>
                          <th scope="col">실제 적중률</th>
                          <th scope="col">평균 범위 폭</th>
                          <th scope="col">범위 산정 표본</th>
                          <th scope="col">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {interval.horizons.map((entry) => (
                          <tr key={entry.horizonWeeks}>
                            <th scope="row" data-label="예측 거리">
                              {describeHorizon(entry.horizonWeeks)}
                            </th>
                            <td data-label="표본">{entry.coverageSampleCount}개</td>
                            <td data-label="실제 적중률">
                              {entry.coverageRatio === null ? '산정 전' : formatRatio(entry.coverageRatio)}
                            </td>
                            <td data-label="평균 범위 폭">
                              {formatMae(entry.averageIntervalWidthKrwPerL)}
                            </td>
                            <td data-label="범위 산정 표본">
                              {entry.calibrationSampleCount}개 · {INTERVAL_SOURCE_LABEL[entry.source]}
                            </td>
                            <td data-label="상태">
                              <span
                                className={`status-tag ${INTERVAL_STATUS_VIEW[entry.status].className}`.trim()}
                              >
                                {INTERVAL_STATUS_VIEW[entry.status].label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="admin-decision__note">
                    전체 가중 적중률 {formatRatio(interval.weightedCoverageRatio)} · 표본{' '}
                    {interval.weightedCoverageSampleCount}개
                  </p>
                </div>
              </details>
            </>
          )}
          <p className="admin-decision__note">
            예상 범위는 과거 예측 오차 분포로 계산한 통계적 참고 범위이며, 중심 예측값·FSC 계산을
            바꾸지 않습니다.
          </p>
        </div>

        <div className="admin-panel">
          <strong>실전 범위 검증</strong>
          <p className="admin-decision__note">
            실제 발행된 예측 범위와 확정 실제값을 비교합니다. 과거 백테스트 적중률과 별도로 누적합니다.
            {publicationEnabled ? ' 예상 범위 공개 켜짐' : ' 예상 범위 공개 꺼짐'}
          </p>
          {forwardSummaries.length === 0 ? (
            <p className="backtest-detail__empty">실전 범위 검증 적용 이전</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table horizon-profile-table">
                <thead>
                  <tr>
                    <th scope="col">예측 거리</th>
                    <th scope="col">검증 표본</th>
                    <th scope="col">실전 적중률</th>
                    <th scope="col">평균 범위 폭</th>
                    <th scope="col">상태</th>
                    <th scope="col">공개</th>
                  </tr>
                </thead>
                <tbody>
                  {forwardSummaries.map((summary) => (
                    <tr key={summary.horizonWeeks}>
                      <th scope="row" data-label="예측 거리">
                        {describeHorizon(summary.horizonWeeks)}
                      </th>
                      <td data-label="검증 표본">
                        {summary.coverageHitCount}/{summary.coverageSampleCount}개
                        {summary.pendingSampleCount === 0
                          ? ''
                          : ` · 대기 ${summary.pendingSampleCount}개`}
                      </td>
                      <td data-label="실전 적중률">
                        {summary.coverageRatio === null ? '산정 중' : formatRatio(summary.coverageRatio)}
                      </td>
                      <td data-label="평균 범위 폭">
                        {formatMae(summary.averageIntervalWidthKrwPerL)}
                      </td>
                      <td data-label="상태">
                        <span className="admin-table__inline">
                          {INTERVAL_STATUS_VIEW[summary.status].label}
                        </span>
                      </td>
                      <td data-label="공개">
                        <span className="admin-table__inline">
                          <span
                            className={`status-tag ${
                              summary.publication === 'eligible' && publicationEnabled
                                ? 'status-tag--ok'
                                : ''
                            }`.trim()}
                          >
                            {PUBLICATION_LABEL[summary.publication]}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="admin-decision__note">
            예상 범위 공개를 켜도 실전 검증이 `적정`인 예측 거리만 사용자 화면에 예상 범위가 표시됩니다.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

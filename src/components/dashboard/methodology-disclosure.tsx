import { formatDisplayDateTime } from './dashboard-format';

import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';
import { formatDataDelay } from '@/lib/dashboard/dashboard-time';

type MethodologyDisclosureProps = {
  fsc: FscDashboardResultSection;
};

const POLICY_ITEMS = [
  '완료된 주차는 Actual 값을 우선 적용합니다.',
  '미완료 주차는 Forecast 값을 적용해 분기 예상 평균을 산출합니다.',
  'Forecast는 최근 주간 경유가 추세와 선택된 보조 지표를 반영합니다.',
  '신뢰도는 최근 13주 MAPE를 기준으로 최근 오차 추세, 장기 안정성, 데이터 최신성을 함께 반영합니다.',
  '데이터가 갱신되면 이후 Forecast와 FSC 결과를 다시 산출합니다.',
] as const;

export function MethodologyDisclosure({ fsc }: MethodologyDisclosureProps) {
  return (
    <section className="methodology surface-panel" aria-labelledby="methodology-title">
      <details>
        <summary>
          <span>
            <strong id="methodology-title">산출 기준 및 데이터 정책</strong>
            <small>Actual 값이 있는 완료 주차는 Forecast로 덮어쓰지 않습니다.</small>
          </span>
        </summary>
        <div className="methodology__body">
          <div className="methodology__group">
            <h3>산출 정책</h3>
            <ul>
              {POLICY_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="methodology__group">
            <h3>데이터 처리 시각</h3>
            <dl className="methodology__timeline">
              <div>
                <dt>데이터 기준 시각</dt>
                <dd>{formatDisplayDateTime(fsc.dataBasisAt)}</dd>
              </div>
              <div>
                <dt>예측 실행 시각</dt>
                <dd>{formatDisplayDateTime(fsc.forecastCompletedAt)}</dd>
              </div>
              <div>
                <dt>FSC 결과 생성</dt>
                <dd>{formatDisplayDateTime(fsc.createdAt)}</dd>
              </div>
              <div>
                <dt>승인 완료</dt>
                <dd>{fsc.approvedAt === null ? '승인 대기' : formatDisplayDateTime(fsc.approvedAt)}</dd>
              </div>
              <div>
                <dt>현재 데이터 지연</dt>
                <dd>{formatDataDelay(fsc.dataDelayMinutes)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </details>
    </section>
  );
}

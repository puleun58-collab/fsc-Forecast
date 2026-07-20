import { RELIABILITY_POLICY_ITEMS } from './dashboard-format';
import { formatDisplayDateTime } from './dashboard-format';

import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';
import { formatDataDelay } from '@/lib/dashboard/dashboard-time';

type MethodologyDisclosureProps = {
  fsc: FscDashboardResultSection;
};

const POLICY_ITEMS = [
  'actual 값이 존재하는 완료 주차는 예측값보다 우선합니다.',
  'forecast 구간은 주간 예측값, 월간 예측값, 보수적 대체값 순서로 표시 출처를 구분합니다.',
  ...RELIABILITY_POLICY_ITEMS,
  '내부 식별자와 revision ID는 의사결정 화면에 노출하지 않습니다.',
] as const;

export function MethodologyDisclosure({ fsc }: MethodologyDisclosureProps) {
  return (
    <section className="methodology surface-panel" aria-labelledby="methodology-title">
      <details>
        <summary>
          <span>
            <strong id="methodology-title">산출 기준 및 데이터 정책</strong>
            <small>actual 값이 있는 완료 주차는 forecast로 덮어쓰지 않습니다.</small>
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

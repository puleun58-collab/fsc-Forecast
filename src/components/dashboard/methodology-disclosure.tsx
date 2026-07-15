import { formatDisplayDateTime } from './dashboard-format';

import type { FscDashboardResultSection } from '@/lib/dashboard/fsc-types';

type MethodologyDisclosureProps = {
  fsc: FscDashboardResultSection;
};

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
          <p>
            산출 기준일은 {formatDisplayDateTime(fsc.createdAt)}이며, active quarter의 실제 주차 가격과 forecast 주차 가격을
            같은 데이터 구조에서 결합해 분기 평균 예상 유가를 계산합니다.
          </p>
          <ul>
            <li>actual 값이 존재하는 완료 주차는 예측값보다 우선합니다.</li>
            <li>forecast 구간은 주간 예측값, 월간 예측값, 보수적 대체값 순서로 표시 출처를 구분합니다.</li>
            <li>신뢰도는 최근 예측 오차 지표가 충분히 확보된 뒤 산정합니다.</li>
            <li>내부 식별자와 revision ID는 의사결정 화면에 노출하지 않습니다.</li>
          </ul>
        </div>
      </details>
    </section>
  );
}

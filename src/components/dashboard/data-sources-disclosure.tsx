import { formatSourceCollectionDate, formatSourceObservation } from '@/lib/dashboard/data-sources';

import type { DashboardDataSource } from '@/lib/dashboard/fsc-types';

type DataSourcesDisclosureProps = {
  dataSources: readonly DashboardDataSource[];
};

function mapStatusLabel(status: DashboardDataSource['status']): string {
  switch (status) {
    case 'available':
      return '사용 중';
    case 'delayed':
      return '확인 지연';
    case 'unavailable':
    default:
      return '현재 데이터 확인 불가';
  }
}

export function DataSourcesDisclosure({ dataSources }: DataSourcesDisclosureProps) {
  return (
    <section className="data-sources surface-panel" aria-labelledby="data-sources-title">
      <details>
        <summary>
          <span>
            <strong id="data-sources-title">데이터 출처 및 유의사항</strong>
            <small>오피넷·두바이유·USD/KRW 원천 정보</small>
          </span>
        </summary>
        <div className="data-sources__body">
          <div className="data-sources__group">
            <h3>데이터 출처</h3>
            <p>대시보드에 실제로 표시하거나 계산에 사용하는 원천 데이터만 공개합니다.</p>
          </div>
          <div className="data-sources__cards" aria-label="출처별 상세 정보">
            {dataSources.map((source) => {
              const formattedObservedAt = formatSourceObservation(source.latestObservedAt, source.observationGranularity);
              const formattedCollectedAt = formatSourceCollectionDate(source.latestCollectedAt);


              return (
                <article className="data-source-card" key={source.sourceCode}>
                  <div className="data-source-card__header">
                    <div>
                      <h3>{source.displayName}</h3>
                      <p>{source.dataName}</p>
                    </div>
                    <span className={`data-source-card__status data-source-card__status--${source.status}`}>
                      {mapStatusLabel(source.status)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>데이터 코드</dt>
                      <dd>{source.dataCode ?? '없음'}</dd>
                    </div>
                    <div>
                      <dt>단위</dt>
                      <dd>{source.unitLabel}</dd>
                    </div>
                    <div>
                      <dt>데이터 제공 주기</dt>
                      <dd>{source.providerFrequencyLabel}</dd>
                    </div>
                    <div>
                      <dt>앱 확인 주기</dt>
                      <dd>{source.collectionFrequencyLabel ?? '확인 불가'}</dd>
                    </div>
                    <div>
                      <dt>사용 목적</dt>
                      <dd>{source.purpose}</dd>
                    </div>
                    <div>
                      <dt>최종 관측 기준</dt>
                      <dd>
                        <time dateTime={source.latestObservedAt ?? undefined}>{formattedObservedAt}</time>
                      </dd>
                    </div>
                    <div>
                      <dt>데이터 수집일</dt>
                      <dd>
                        <time dateTime={source.latestCollectedAt ?? undefined}>{formattedCollectedAt}</time>
                      </dd>
                    </div>
                    <div>
                      <dt>제공</dt>
                      <dd>{source.providerName}</dd>
                    </div>
                    {source.originalProviderName ? (
                      <div>
                        <dt>원출처</dt>
                        <dd>{source.originalProviderName}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="data-source-card__description">{source.description}</p>
                  {source.sourceUrl ? (
                    <a
                      className="button button--secondary data-source-card__link"
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${source.displayName} 공식 데이터 원문 보기`}
                    >
                      {source.displayName === '오피넷' ? '공식 사이트 보기' : '원문 보기'}
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="data-sources__group">
            <h3>데이터 이용 안내</h3>
            <p>오피넷은 국내 Actual 산정에 사용하고, 두바이유와 USD/KRW는 시장 방향을 해석하기 위한 참고 지표로 사용합니다.</p>
          </div>
          <div className="data-sources__group">
            <h3>유의사항</h3>
            <p>
              본 결과는 FSC 운영 의사결정을 지원하기 위한 예측 및 참고 정보입니다. 실제 계약 단가, 정산 단가 또는 확정 가격을 의미하지 않습니다.
            </p>
            <p>
              원천 데이터의 수정, 제공 지연, 국제 원유가격과 환율 변동, 예측 모델 재실행 및 운영 설정 변경에 따라 결과가 달라질 수 있습니다.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

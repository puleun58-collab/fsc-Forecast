'use client';

type ErrorPageProps = {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main id="main-content" className="app-state" aria-labelledby="error-title">
      <section className="app-state__panel">
        <p className="dashboard-shell__metric-label">FSC Forecast Dashboard</p>
        <h1 id="error-title" className="app-state__title">
          대시보드를 불러오지 못했습니다.
        </h1>
        <p className="app-state__copy">
          데이터 연결 또는 산출 결과 조회 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        {error.digest ? <p className="dashboard-shell__metric-caption">오류 참조: {error.digest}</p> : null}
        <div className="app-state__actions">
          <button type="button" className="button button--primary" onClick={reset}>
            다시 시도
          </button>
          <a className="button button--secondary" href="/">
            대시보드로 이동
          </a>
        </div>
      </section>
    </main>
  );
}

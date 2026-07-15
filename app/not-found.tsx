export default function NotFound() {
  return (
    <main id="main-content" className="app-state" aria-labelledby="not-found-title">
      <section className="app-state__panel">
        <p className="dashboard-shell__metric-label">FSC Forecast Dashboard</p>
        <h1 id="not-found-title" className="app-state__title">
          요청한 화면을 찾을 수 없습니다.
        </h1>
        <p className="app-state__copy">
          주소가 바뀌었거나 접근할 수 없는 관리 화면일 수 있습니다.
        </p>
        <div className="app-state__actions">
          <a className="button button--primary" href="/">
            대시보드로 이동
          </a>
          <a className="button button--secondary" href="/admin/login">
            관리자 로그인
          </a>
        </div>
      </section>
    </main>
  );
}

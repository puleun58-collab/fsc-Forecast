export default function Loading() {
  return (
    <main id="main-content" className="fsc-dashboard" aria-busy="true">
      <header className="ops-header">
        <div className="ops-header__identity">
          <strong>FSC Forecast</strong>
          <span>Fuel surcharge decision support</span>
        </div>
        <div className="ops-header__controls">
          <div className="skeleton skeleton--control" />
          <div className="skeleton skeleton--control" />
        </div>
      </header>
      <div className="status-rail" aria-label="데이터 상태 로딩 중">
        <span className="status-tag status-tag--neutral">데이터 확인 중</span>
        <span className="status-tag status-tag--neutral">승인 상태 확인 중</span>
        <span className="status-tag status-tag--neutral">신뢰도 확인 중</span>
      </div>
      <section className="decision-summary surface-panel">
        <div className="decision-summary__primary">
          <div className="skeleton skeleton--label" />
          <div className="skeleton skeleton--headline" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton-grid skeleton-grid--tight">
            <div className="skeleton skeleton--metric" />
            <div className="skeleton skeleton--metric" />
          </div>
        </div>
        <div className="decision-summary__scenario">
          <div className="skeleton skeleton--metric" />
          <div className="skeleton skeleton--metric" />
          <div className="skeleton skeleton--line" />
        </div>
      </section>
      <section className="surface-panel">
        <div className="skeleton skeleton--chart" />
      </section>
    </main>
  );
}

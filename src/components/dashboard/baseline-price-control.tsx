type BaselinePriceControlProps = {
  priceInput: string;
  inputError: string | null;
  isPriceModified: boolean;
  onPriceChange: (value: string) => void;
  onPriceReset: () => void;
};

export function BaselinePriceControl({
  priceInput,
  inputError,
  isPriceModified,
  onPriceChange,
  onPriceReset,
}: BaselinePriceControlProps) {
  return (
    <section className="baseline-control surface-panel" aria-labelledby="baseline-control-title">
      <div className="baseline-control__intro">
        <p className="section-heading__label">공통 계산 기준</p>
        <h2 id="baseline-control-title">기준유가 설정</h2>
        <p>4개 핵심 카드의 공통 계산 기준입니다.</p>
      </div>
      <div className="baseline-control__interaction">
        <div className="baseline-control__fields">
          <label htmlFor="scenario-price-input" className="metric-label">
            기준유가
          </label>
          <span className={`price-input${inputError ? ' price-input--error' : ''}`}>
            <input
              id="scenario-price-input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={priceInput}
              aria-describedby="scenario-price-help"
              aria-invalid={inputError !== null}
              onChange={(event) => onPriceChange(event.target.value)}
            />
            <span>원/L</span>
          </span>
          <button type="button" onClick={onPriceReset} disabled={!isPriceModified && inputError === null}>
            초기화
          </button>
        </div>
        <p
          id="scenario-price-help"
          className={inputError ? 'price-input__help price-input__help--error' : 'price-input__help'}
        >
          {inputError ??
            (isPriceModified
              ? '입력한 기준유가로 4개 핵심 카드를 다시 계산했습니다.'
              : '변경하면 아래 4개 핵심 카드에 즉시 반영됩니다.')}
        </p>
      </div>
    </section>
  );
}

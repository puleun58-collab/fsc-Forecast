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
        <span className="section-heading__label">공통 계산 기준</span>
        <h2 id="baseline-control-title">기준유가</h2>
      </div>
      <div className="baseline-control__fields">
        <span className={`price-input${inputError ? ' price-input--error' : ''}`}>
          <input
            id="scenario-price-input"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={priceInput}
            aria-label="기준유가"
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
            ? '입력값을 4개 카드에 반영했습니다.'
            : '4개 카드에 즉시 반영')}
      </p>
    </section>
  );
}

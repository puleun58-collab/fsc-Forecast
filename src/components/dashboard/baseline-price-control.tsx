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
    <section className="baseline-control" aria-label="기준유가 설정">
      <div className="baseline-control__fields">
        <label htmlFor="scenario-price-input">기준유가</label>
        <span className={`price-input${inputError ? ' price-input--error' : ''}`}>
          <input
            id="scenario-price-input"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={priceInput}
            aria-describedby={inputError ? 'scenario-price-help' : undefined}
            aria-invalid={inputError !== null}
            onChange={(event) => onPriceChange(event.target.value)}
          />
          <span>원/L</span>
        </span>
        <button type="button" onClick={onPriceReset} disabled={!isPriceModified && inputError === null}>
          초기화
        </button>
      </div>
      {inputError ? (
        <p id="scenario-price-help" className="price-input__help price-input__help--error">
          {inputError}
        </p>
      ) : null}
    </section>
  );
}

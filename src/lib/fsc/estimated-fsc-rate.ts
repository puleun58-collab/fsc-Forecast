// 예상 FSC율 = 기준유가 대비 증감률 × 유가 비중(현재 fscLowRate = 0.3000).
// 서버·대시보드·테스트가 같은 결과를 쓰도록 이 모듈 하나만 사용한다.
// Prisma.Decimal에 의존하면 클라이언트 번들로 끌려가므로 BigInt 기반 십진 연산으로 동일한 정밀도를 낸다.

export const ESTIMATED_FSC_RATE_SCALE = 6;

export type EstimatedFscRateInput = string | number;

type ScaledDecimal = {
  unscaled: bigint;
  scale: number;
};

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

function parseScaledDecimal(value: EstimatedFscRateInput, fieldName: string): ScaledDecimal {
  const text = typeof value === 'number' ? String(value) : value.trim();
  const match = DECIMAL_PATTERN.exec(text);

  if (!match) {
    throw new Error(`${fieldName} must be a finite decimal value, received '${text}'.`);
  }

  const [, sign, whole, fraction = '', exponent = '0'] = match;
  const digits = BigInt(`${whole}${fraction}`);
  const scale = fraction.length - Number(exponent);

  if (scale < 0) {
    return { unscaled: (sign === '-' ? -digits : digits) * 10n ** BigInt(-scale), scale: 0 };
  }

  return { unscaled: sign === '-' ? -digits : digits, scale };
}

function roundHalfUp(unscaled: bigint, scale: number, targetScale: number): bigint {
  if (scale <= targetScale) {
    return unscaled * 10n ** BigInt(targetScale - scale);
  }

  const divisor = 10n ** BigInt(scale - targetScale);
  const quotient = unscaled / divisor;
  const remainder = unscaled % divisor;
  const roundsUp = remainder < 0n ? -remainder * 2n >= divisor : remainder * 2n >= divisor;

  if (!roundsUp) {
    return quotient;
  }

  return unscaled < 0n ? quotient - 1n : quotient + 1n;
}

function formatScaled(unscaled: bigint, scale: number): string {
  const negative = unscaled < 0n;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);

  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

/**
 * 소수 여섯째 자리 half-up으로 반올림한 예상 FSC율 비율 문자열을 돌려준다.
 */
export function calculateEstimatedFscRate(input: {
  diffRatio: EstimatedFscRateInput;
  oilWeightRate: EstimatedFscRateInput;
}): string {
  const diffRatio = parseScaledDecimal(input.diffRatio, 'diffRatio');
  const oilWeightRate = parseScaledDecimal(input.oilWeightRate, 'oilWeightRate');
  const product = roundHalfUp(
    diffRatio.unscaled * oilWeightRate.unscaled,
    diffRatio.scale + oilWeightRate.scale,
    ESTIMATED_FSC_RATE_SCALE,
  );

  return formatScaled(product, ESTIMATED_FSC_RATE_SCALE);
}

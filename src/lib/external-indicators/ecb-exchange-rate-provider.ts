import type {
  ExternalIndicatorProvider,
  ExternalIndicatorProviderRequest,
  ExternalIndicatorProviderResult,
} from './provider-contract';
import type { ExternalIndicatorPoint } from './types';

const ECB_PROVIDER_KEY = 'ecb-daily-reference-rates';
const ECB_HISTORY_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
const ECB_SERIES = {
  krwPerEur: 'EXR.D.KRW.EUR.SP00.A',
  usdPerEur: 'EXR.D.USD.EUR.SP00.A',
} as const;

function parseObservedAt(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`ECB returned an invalid observation date: '${value}'.`);
  }

  return date;
}

function matchesWindow(
  observedAt: Date,
  request: ExternalIndicatorProviderRequest,
): boolean {
  if (request.observedAtOrAfter && observedAt < request.observedAtOrAfter) {
    return false;
  }

  if (request.observedAtOrBefore && observedAt > request.observedAtOrBefore) {
    return false;
  }

  return true;
}

function parseAttributes(value: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([A-Za-z]+)=["']([^"']*)["']/g;

  for (const match of value.matchAll(attributePattern)) {
    const [, name, attributeValue] = match;

    if (name && attributeValue !== undefined) {
      attributes.set(name, attributeValue);
    }
  }

  return attributes;
}

function parsePositiveRate(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function parseEcbDailyUsdKrwXml(
  xml: string,
  request: ExternalIndicatorProviderRequest = { indicatorCodes: ['usd-krw'] },
): ExternalIndicatorPoint[] {
  const points: ExternalIndicatorPoint[] = [];
  const dailyCubePattern = /<Cube\b([^>]*\btime=["'][^"']+["'][^>]*)>([\s\S]*?)<\/Cube>/g;

  for (const dailyMatch of xml.matchAll(dailyCubePattern)) {
    const dateValue = parseAttributes(dailyMatch[1] ?? '').get('time');
    const dailyRatesXml = dailyMatch[2] ?? '';

    if (!dateValue) {
      continue;
    }

    const observedAt = parseObservedAt(dateValue);

    if (!matchesWindow(observedAt, request)) {
      continue;
    }

    const rates = new Map<string, number>();
    const rateCubePattern = /<Cube\b([^>]*\bcurrency=["'][^"']+["'][^>]*)\/?>/g;

    for (const rateMatch of dailyRatesXml.matchAll(rateCubePattern)) {
      const attributes = parseAttributes(rateMatch[1] ?? '');
      const currency = attributes.get('currency');
      const rate = parsePositiveRate(attributes.get('rate'));

      if (currency && rate !== null) {
        rates.set(currency, rate);
      }
    }

    const usdPerEur = rates.get('USD');
    const krwPerEur = rates.get('KRW');

    if (!usdPerEur || !krwPerEur) {
      continue;
    }

    const krwPerUsd = Math.round((krwPerEur / usdPerEur) * 10_000) / 10_000;

    points.push({
      indicatorCode: 'usd-krw',
      observedAt,
      value: krwPerUsd,
      sourcePayload: {
        provider: ECB_PROVIDER_KEY,
        sourceUrl: ECB_HISTORY_URL,
        seriesIds: ECB_SERIES,
        frequency: 'daily',
        unit: 'krw_per_usd',
        valueBasis: 'ecb_euro_reference_cross_rate',
        date: dateValue,
        euroReferenceRates: {
          USD: usdPerEur,
          KRW: krwPerEur,
        },
        calculation: 'KRW_per_EUR / USD_per_EUR',
      },
    });
  }

  return points.sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
}

export const ecbExchangeRateProvider: ExternalIndicatorProvider = {
  providerKey: ECB_PROVIDER_KEY,
  supportedIndicatorCodes: ['usd-krw'],
  async fetchHistory(
    request: ExternalIndicatorProviderRequest,
  ): Promise<ExternalIndicatorProviderResult> {
    if (!request.indicatorCodes.includes('usd-krw')) {
      return {
        providerKey: ECB_PROVIDER_KEY,
        points: [],
      };
    }

    const response = await (request.fetchImpl ?? fetch)(ECB_HISTORY_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/xml, text/xml',
      },
      cache: 'no-store',
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`ECB daily exchange-rate request failed with status ${response.status}.`);
    }

    return {
      providerKey: ECB_PROVIDER_KEY,
      points: parseEcbDailyUsdKrwXml(await response.text(), request),
    };
  },
};

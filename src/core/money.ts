import type { CurrencyCode, ExchangeRateEntry } from './types';

export interface CurrencyMeta {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  PHP: { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
};

export const CURRENCY_LIST: CurrencyMeta[] = Object.values(CURRENCIES);

export function getCurrencyDecimals(currency: CurrencyCode): number {
  return CURRENCIES[currency]?.decimals ?? 2;
}

/**
 * Converts a decimal number or numeric string to integer minor units (e.g. cents)
 * using string decimal parsing to avoid floating-point drift.
 */
export function toMinorUnits(input: number | string, currency: CurrencyCode): number {
  const decimals = getCurrencyDecimals(currency);
  const raw = typeof input === 'number' ? input.toFixed(decimals) : String(input).trim();
  if (!raw) return 0;

  const cleaned = raw.replace(/[,\s]/g, '');
  const negative = cleaned.startsWith('-');
  const unsigned = negative ? cleaned.slice(1) : cleaned.replace(/^\+/, '');
  if (!/^\d*(\.\d*)?$/.test(unsigned) || unsigned === '' || unsigned === '.') {
    return 0;
  }

  const [wholePart = '0', fracPart = ''] = unsigned.split('.');
  const paddedFrac = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const roundingDigit = fracPart.length > decimals ? Number(fracPart[decimals]) : 0;

  let minor = Number(wholePart) * 10 ** decimals + (decimals > 0 ? Number(paddedFrac) : 0);
  if (roundingDigit >= 5) {
    minor += 1;
  }
  return negative ? -minor : minor;
}

export function fromMinorUnits(minor: number, currency: CurrencyCode): number {
  const decimals = getCurrencyDecimals(currency);
  return minor / 10 ** decimals;
}

export function formatMoney(
  minor: number,
  currency: CurrencyCode,
  locale = 'en-US',
  options?: { showPlus?: boolean; compact?: boolean }
): string {
  const decimals = getCurrencyDecimals(currency);
  const value = fromMinorUnits(minor, currency);
  const absValue = Math.abs(value);

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: options?.compact ? 0 : decimals,
    maximumFractionDigits: options?.compact ? 1 : decimals,
    notation: options?.compact && absValue >= 10000 ? 'compact' : 'standard',
  });

  const formatted = formatter.format(absValue);
  if (minor < 0) return `-${formatted}`;
  if (options?.showPlus && minor > 0) return `+${formatted}`;
  return formatted;
}

export interface ConversionResult {
  convertedMinor: number | null;
  rateUsed: ExchangeRateEntry | null;
  missingRate: boolean;
}

/**
 * Converts minor units from `fromCurrency` to `toCurrency` using ONLY explicit
 * ExchangeRateEntry records. Never fabricates or silently guesses a rate.
 */
export function convertMinorUnits(
  amountMinor: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  fxRates: ExchangeRateEntry[],
  allowPivot = true
): ConversionResult {
  if (fromCurrency === toCurrency) {
    return { convertedMinor: amountMinor, rateUsed: null, missingRate: false };
  }

  const direct = fxRates.find((r) => r.base === fromCurrency && r.quote === toCurrency && r.rate > 0);
  if (direct) {
    const major = fromMinorUnits(amountMinor, fromCurrency) * direct.rate;
    return {
      convertedMinor: toMinorUnits(major, toCurrency),
      rateUsed: direct,
      missingRate: false,
    };
  }

  const inverse = fxRates.find((r) => r.base === toCurrency && r.quote === fromCurrency && r.rate > 0);
  if (inverse) {
    const rate = 1 / inverse.rate;
    const major = fromMinorUnits(amountMinor, fromCurrency) * rate;
    return {
      convertedMinor: toMinorUnits(major, toCurrency),
      rateUsed: {
        base: fromCurrency,
        quote: toCurrency,
        rate,
        updatedAt: inverse.updatedAt,
        source: `${inverse.source} (inverse)`,
      },
      missingRate: false,
    };
  }

  if (allowPivot) {
    for (const pivot of ['USD', 'EUR'] as CurrencyCode[]) {
      if (pivot === fromCurrency || pivot === toCurrency) continue;
      const first = convertMinorUnits(amountMinor, fromCurrency, pivot, fxRates, false);
      if (!first.missingRate && first.convertedMinor !== null) {
        const second = convertMinorUnits(first.convertedMinor, pivot, toCurrency, fxRates, false);
        if (!second.missingRate && second.convertedMinor !== null && first.rateUsed && second.rateUsed) {
          return {
            convertedMinor: second.convertedMinor,
            rateUsed: {
              base: fromCurrency,
              quote: toCurrency,
              rate: first.rateUsed.rate * second.rateUsed.rate,
              updatedAt:
                first.rateUsed.updatedAt < second.rateUsed.updatedAt
                  ? first.rateUsed.updatedAt
                  : second.rateUsed.updatedAt,
              source: `${first.rateUsed.source} via ${pivot}`,
            },
            missingRate: false,
          };
        }
      }
    }
  }

  return { convertedMinor: null, rateUsed: null, missingRate: true };
}

export function formatDisplayDate(
  isoDate: string,
  format: 'YYYY-MM-DD' | 'MMM D, YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' = 'MMM D, YYYY',
  locale = 'en-US'
): string {
  if (!isoDate) return '';
  if (format === 'YYYY-MM-DD') return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  if (format === 'DD/MM/YYYY') {
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  if (format === 'MM/DD/YYYY') {
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

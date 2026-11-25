import { fromMinorUnits, toMinorUnits } from './money.ts';
import type {
  Category,
  CurrencyCode,
  FinoraLedgerState,
  Transaction,
  TransactionType,
} from './types.ts';

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export function parseCsvText(csvText: string): ParsedTable {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (ch === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((h, idx) => h || `Column ${idx + 1}`);
  return { headers, rows: rows.slice(1) };
}

export interface ImportColumnMapping {
  dateCol: number;
  descriptionCol: number;
  amountCol: number;
  typeCol: number;     // -1 if inferred from amount sign
  categoryCol: number; // -1 if none
  merchantCol: number; // -1 if none
  currencyCol: number; // -1 if default
  notesCol: number;    // -1 if none
}

export function guessColumnMapping(headers: string[]): ImportColumnMapping {
  const findCol = (patterns: RegExp[]): number =>
    headers.findIndex((h) => patterns.some((p) => p.test(h.toLowerCase())));

  return {
    dateCol: Math.max(0, findCol([/date/, /posted/, /time/])),
    descriptionCol: Math.max(0, findCol([/desc/, /memo/, /narrative/, /title/, /detail/])),
    amountCol: Math.max(0, findCol([/amount/, /value/, /sum/, /total/, /debit/])),
    typeCol: findCol([/^type$/, /kind/, /direction/]),
    categoryCol: findCol([/categ/, /group/]),
    merchantCol: findCol([/merchant/, /payee/, /vendor/, /source/]),
    currencyCol: findCol([/curr/, /ccy/]),
    notesCol: findCol([/note/, /comment/]),
  };
}

export function normalizeImportDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD or ISO prefix
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const mm = Number(m);
    const dd = Number(d);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = slashMatch[3];
    // If first > 12, it must be DD/MM/YYYY; otherwise default MM/DD/YYYY
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

export function parseImportAmount(raw: string): { signedValue: number; valid: boolean } {
  let s = raw.trim();
  if (!s) return { signedValue: 0, valid: false };
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$€£¥₱₹,\s]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const num = Number(s);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return { signedValue: 0, valid: false };
  }
  return { signedValue: negative ? -num : num, valid: true };
}

export interface ImportPreviewRow {
  rowIndex: number;
  valid: boolean;
  errors: string[];
  isDuplicate: boolean;
  date: string;
  description: string;
  merchant: string;
  type: TransactionType;
  amountMinor: number;
  currency: CurrencyCode;
  categoryId: string | null;
  rawCategory: string;
  notes: string;
  selected: boolean;
}

export function buildImportPreview(
  table: ParsedTable,
  mapping: ImportColumnMapping,
  defaultAccountId: string,
  defaultCurrency: CurrencyCode,
  existingTransactions: Transaction[],
  categories: Category[],
  categoryOverrides: Record<string, string>
): ImportPreviewRow[] {
  const validCurrencies = new Set<string>([
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD', 'PHP', 'INR',
  ]);

  return table.rows.map((row, idx) => {
    const errors: string[] = [];
    const rawDate = row[mapping.dateCol] ?? '';
    const date = normalizeImportDate(rawDate);
    if (!date) errors.push(`Invalid date "${rawDate}"`);

    const description = (row[mapping.descriptionCol] ?? '').trim() || 'Imported transaction';
    const rawAmount = row[mapping.amountCol] ?? '';
    const amtParsed = parseImportAmount(rawAmount);
    if (!amtParsed.valid || amtParsed.signedValue === 0) {
      errors.push(`Invalid amount "${rawAmount}"`);
    }

    const rawCurr = mapping.currencyCol >= 0 ? (row[mapping.currencyCol] ?? '').toUpperCase().trim() : '';
    const currency: CurrencyCode = validCurrencies.has(rawCurr)
      ? (rawCurr as CurrencyCode)
      : defaultCurrency;

    let type: TransactionType = amtParsed.signedValue < 0 ? 'expense' : 'income';
    if (mapping.typeCol >= 0) {
      const rawType = (row[mapping.typeCol] ?? '').toLowerCase().trim();
      if (rawType.includes('exp') || rawType.includes('debit') || rawType.includes('out')) {
        type = 'expense';
      } else if (rawType.includes('inc') || rawType.includes('credit') || rawType.includes('dep')) {
        type = 'income';
      } else if (rawType.includes('refund')) {
        type = 'refund';
      } else if (rawType.includes('trans')) {
        type = 'transfer';
      }
    }

    const amountMinor = toMinorUnits(Math.abs(amtParsed.signedValue), currency);
    const merchant =
      mapping.merchantCol >= 0 && row[mapping.merchantCol]
        ? row[mapping.merchantCol].trim()
        : description;
    const rawCategory = mapping.categoryCol >= 0 ? (row[mapping.categoryCol] ?? '').trim() : '';
    const notes = mapping.notesCol >= 0 ? (row[mapping.notesCol] ?? '').trim() : '';

    // Map category
    let categoryId: string | null = categoryOverrides[rawCategory.toLowerCase()] ?? null;
    if (!categoryId && rawCategory) {
      const matched = categories.find(
        (c) => !c.archived && c.name.toLowerCase() === rawCategory.toLowerCase()
      );
      if (matched) categoryId = matched.id;
    }

    const isDuplicate = Boolean(
      date &&
        amountMinor > 0 &&
        existingTransactions.some(
          (tx) =>
            tx.accountId === defaultAccountId &&
            tx.date === date &&
            tx.amountMinor === amountMinor &&
            (tx.description.toLowerCase() === description.toLowerCase() ||
              tx.merchant.toLowerCase() === merchant.toLowerCase())
        )
    );

    const valid = errors.length === 0;
    return {
      rowIndex: idx + 1,
      valid,
      errors,
      isDuplicate,
      date: date ?? '',
      description,
      merchant,
      type,
      amountMinor,
      currency,
      categoryId,
      rawCategory,
      notes,
      selected: valid && !isDuplicate,
    };
  });
}

function escapeCsvCell(value: string): string {
  // Neutralize spreadsheet formula triggers before quoting
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function transactionsToCsv(
  transactions: Transaction[],
  state: FinoraLedgerState
): string {
  const headers = [
    'Date',
    'Time',
    'Type',
    'Description',
    'Merchant',
    'Category',
    'Account',
    'To Account',
    'Amount',
    'Currency',
    'Payment Method',
    'Status',
    'Tags',
    'Notes',
  ];

  const lines = [headers.map(escapeCsvCell).join(',')];

  for (const tx of transactions) {
    const cat = state.categories.find((c) => c.id === tx.categoryId)?.name ?? '';
    const acc = state.accounts.find((a) => a.id === tx.accountId)?.name ?? '';
    const toAcc = tx.toAccountId
      ? state.accounts.find((a) => a.id === tx.toAccountId)?.name ?? ''
      : '';
    const signed =
      tx.type === 'expense' || (tx.type === 'adjustment' && tx.adjustmentDirection === 'debit')
        ? -fromMinorUnits(tx.amountMinor, tx.currency)
        : fromMinorUnits(tx.amountMinor, tx.currency);

    const row = [
      tx.date,
      tx.time ?? '',
      tx.type,
      tx.description,
      tx.merchant,
      cat,
      acc,
      toAcc,
      String(signed),
      tx.currency,
      tx.paymentMethod,
      tx.status,
      tx.tags.join('; '),
      tx.notes,
    ];
    lines.push(row.map((v) => escapeCsvCell(String(v))).join(','));
  }

  return lines.join('\n');
}

export function validateBackupPayload(data: unknown): data is FinoraLedgerState {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.accounts) &&
    Array.isArray(obj.categories) &&
    Array.isArray(obj.transactions) &&
    Array.isArray(obj.budgets) &&
    Array.isArray(obj.savingsGoals) &&
    typeof obj.preferences === 'object' &&
    obj.preferences !== null
  );
}

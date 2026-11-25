import { convertMinorUnits } from './money.ts';
import type {
  Account,
  Bill,
  Budget,
  CurrencyCode,
  DateRange,
  DateRangePreset,
  ExchangeRateEntry,
  FinoraLedgerState,
  GoalTransaction,
  RecurrenceFrequency,
  RecurringRule,
  SavingsGoal,
  Subscription,
  Transaction,
} from './types.ts';

export function resolveDateRange(
  preset: DateRangePreset,
  referenceDateIso: string,
  customStart?: string,
  customEnd?: string
): DateRange {
  const [y, m, d] = referenceDateIso.split('-').map(Number);
  const ref = new Date(Date.UTC(y, m - 1, d));

  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);

  if (preset === 'today') {
    return { preset, startDate: referenceDateIso, endDate: referenceDateIso };
  }
  if (preset === 'this-week') {
    const day = ref.getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(ref);
    start.setUTCDate(ref.getUTCDate() + mondayOffset);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { preset, startDate: fmt(start), endDate: fmt(end) };
  }
  if (preset === 'this-month') {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return { preset, startDate: fmt(start), endDate: fmt(end) };
  }
  if (preset === 'last-month') {
    const start = new Date(Date.UTC(y, m - 2, 1));
    const end = new Date(Date.UTC(y, m - 1, 0));
    return { preset, startDate: fmt(start), endDate: fmt(end) };
  }
  if (preset === 'this-year') {
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y, 11, 31));
    return { preset, startDate: fmt(start), endDate: fmt(end) };
  }
  return {
    preset: 'custom',
    startDate: customStart || fmt(new Date(Date.UTC(y, m - 1, 1))),
    endDate: customEnd || referenceDateIso,
  };
}

export function isDateInRange(dateIso: string, startDate: string, endDate: string): boolean {
  return dateIso >= startDate && dateIso <= endDate;
}

/**
 * Reconciles an account's real current balance in its native currency from
 * openingBalanceMinor + all completed transactions affecting that account.
 * Scheduled transactions never alter real balances.
 */
export function computeAccountBalanceMinor(
  account: Account,
  transactions: Transaction[],
  fxRates: ExchangeRateEntry[] = []
): number {
  let balance = account.openingBalanceMinor;

  for (const tx of transactions) {
    if (tx.status !== 'completed') continue;

    const getTxInAccountCurrency = (): number | null => {
      if (tx.currency === account.currency) return tx.amountMinor;
      const conv = convertMinorUnits(tx.amountMinor, tx.currency, account.currency, fxRates);
      return conv.convertedMinor;
    };

    if (tx.accountId === account.id) {
      const amt = getTxInAccountCurrency();
      if (amt === null) continue;

      if (tx.type === 'income' || tx.type === 'refund') {
        balance += amt;
      } else if (tx.type === 'expense' || tx.type === 'transfer') {
        balance -= amt;
      } else if (tx.type === 'adjustment') {
        balance += tx.adjustmentDirection === 'debit' ? -amt : amt;
      }
    } else if (tx.type === 'transfer' && tx.toAccountId === account.id) {
      const amt = getTxInAccountCurrency();
      if (amt !== null) {
        balance += amt;
      }
    }
  }

  return balance;
}

export function computeAllAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  fxRates: ExchangeRateEntry[] = []
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    balances[acc.id] = computeAccountBalanceMinor(acc, transactions, fxRates);
  }
  return balances;
}

export interface PeriodSummary {
  totalAvailableBalanceMinor: number;
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  totalRefundsMinor: number;
  netExpensesMinor: number;
  netCashFlowMinor: number;
  savingsRatePct: number | null;
  budgetUtilizationPct: number | null;
  transactionCount: number;
  missingRateCurrencies: CurrencyCode[];
}

export function computePeriodSummary(
  state: FinoraLedgerState,
  dateRange: DateRange,
  targetCurrency: CurrencyCode = state.preferences.primaryCurrency
): PeriodSummary {
  const missingSet = new Set<CurrencyCode>();
  const balances = computeAllAccountBalances(state.accounts, state.transactions, state.fxRates);

  let totalAvailableBalanceMinor = 0;
  for (const acc of state.accounts) {
    if (acc.archived || !acc.includeInTotal) continue;
    const bal = balances[acc.id] ?? 0;
    const conv = convertMinorUnits(bal, acc.currency, targetCurrency, state.fxRates);
    if (conv.missingRate || conv.convertedMinor === null) {
      missingSet.add(acc.currency);
    } else {
      totalAvailableBalanceMinor += conv.convertedMinor;
    }
  }

  let totalIncomeMinor = 0;
  let totalExpensesMinor = 0;
  let totalRefundsMinor = 0;
  let transactionCount = 0;

  for (const tx of state.transactions) {
    if (tx.status !== 'completed') continue;
    if (!isDateInRange(tx.date, dateRange.startDate, dateRange.endDate)) continue;

    transactionCount += 1;
    // Transfers and balance adjustments never count as income or expenses
    if (tx.type === 'transfer' || tx.type === 'adjustment') continue;

    const conv = convertMinorUnits(tx.amountMinor, tx.currency, targetCurrency, state.fxRates);
    if (conv.missingRate || conv.convertedMinor === null) {
      missingSet.add(tx.currency);
      continue;
    }

    if (tx.type === 'income') {
      totalIncomeMinor += conv.convertedMinor;
    } else if (tx.type === 'expense') {
      totalExpensesMinor += conv.convertedMinor;
    } else if (tx.type === 'refund') {
      totalRefundsMinor += conv.convertedMinor;
    }
  }

  const netExpensesMinor = Math.max(0, totalExpensesMinor - totalRefundsMinor);
  const netCashFlowMinor = totalIncomeMinor - netExpensesMinor;
  const savingsRatePct =
    totalIncomeMinor > 0 ? Number(((netCashFlowMinor / totalIncomeMinor) * 100).toFixed(1)) : null;

  // Overall budget utilization across active budgets overlapping the period
  const overallBudgets = state.budgets.filter((b) => b.active && b.categoryId === null);
  const categoryBudgets = state.budgets.filter((b) => b.active && b.categoryId !== null);
  const refBudgets = overallBudgets.length > 0 ? overallBudgets : categoryBudgets;

  let budgetLimitTotal = 0;
  let budgetSpentTotal = 0;
  for (const b of refBudgets) {
    const status = computeBudgetStatus(b, state.transactions, state.fxRates, dateRange.endDate);
    const limitConv = convertMinorUnits(status.effectiveLimitMinor, b.currency, targetCurrency, state.fxRates);
    const spentConv = convertMinorUnits(status.spentMinor, b.currency, targetCurrency, state.fxRates);
    if (limitConv.convertedMinor !== null && spentConv.convertedMinor !== null) {
      budgetLimitTotal += limitConv.convertedMinor;
      budgetSpentTotal += spentConv.convertedMinor;
    }
  }

  const budgetUtilizationPct =
    budgetLimitTotal > 0 ? Number(((budgetSpentTotal / budgetLimitTotal) * 100).toFixed(1)) : null;

  return {
    totalAvailableBalanceMinor,
    totalIncomeMinor,
    totalExpensesMinor,
    totalRefundsMinor,
    netExpensesMinor,
    netCashFlowMinor,
    savingsRatePct,
    budgetUtilizationPct,
    transactionCount,
    missingRateCurrencies: Array.from(missingSet),
  };
}

export interface BudgetStatus {
  budget: Budget;
  effectiveLimitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  utilizationPct: number;
  projectedSpendMinor: number;
  state: 'on-track' | 'approaching' | 'exceeded';
}

export function daysBetweenInclusive(startIso: string, endIso: string): number {
  const s = Date.parse(`${startIso}T00:00:00Z`);
  const e = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 1;
  return Math.floor((e - s) / 86400000) + 1;
}

export function computeBudgetStatus(
  budget: Budget,
  transactions: Transaction[],
  fxRates: ExchangeRateEntry[],
  referenceDateIso: string
): BudgetStatus {
  const effectiveLimitMinor =
    budget.amountMinor + (budget.carryOver ? budget.previousCarryOverMinor : 0);

  let rawExpenseMinor = 0;
  let refundMinor = 0;

  for (const tx of transactions) {
    if (tx.status !== 'completed') continue;
    if (!isDateInRange(tx.date, budget.startDate, budget.endDate)) continue;
    if (tx.type !== 'expense' && tx.type !== 'refund') continue;
    if (budget.categoryId !== null && tx.categoryId !== budget.categoryId) continue;

    const conv = convertMinorUnits(tx.amountMinor, tx.currency, budget.currency, fxRates);
    if (conv.convertedMinor === null) continue;

    if (tx.type === 'expense') rawExpenseMinor += conv.convertedMinor;
    else if (tx.type === 'refund') refundMinor += conv.convertedMinor;
  }

  const spentMinor = Math.max(0, rawExpenseMinor - refundMinor);
  const remainingMinor = effectiveLimitMinor - spentMinor;
  const utilizationPct =
    effectiveLimitMinor > 0 ? Number(((spentMinor / effectiveLimitMinor) * 100).toFixed(1)) : 0;

  const totalDays = daysBetweenInclusive(budget.startDate, budget.endDate);
  const clampedRef =
    referenceDateIso < budget.startDate
      ? budget.startDate
      : referenceDateIso > budget.endDate
      ? budget.endDate
      : referenceDateIso;
  const elapsedDays = daysBetweenInclusive(budget.startDate, clampedRef);
  const projectedSpendMinor =
    elapsedDays > 0 ? Math.round((spentMinor / elapsedDays) * totalDays) : spentMinor;

  let state: 'on-track' | 'approaching' | 'exceeded' = 'on-track';
  if (spentMinor > effectiveLimitMinor) {
    state = 'exceeded';
  } else if (utilizationPct >= budget.alertThresholdPct) {
    state = 'approaching';
  }

  return {
    budget,
    effectiveLimitMinor,
    spentMinor,
    remainingMinor,
    utilizationPct,
    projectedSpendMinor,
    state,
  };
}

export interface SavingsGoalProgress {
  goal: SavingsGoal;
  savedMinor: number;
  remainingMinor: number;
  progressPct: number;
  daysRemaining: number;
  monthsRemaining: number;
  requiredMonthlyMinor: number;
  avgMonthlyContributionMinor: number;
  estimatedCompletionDate: string | null;
  entryCount: number;
}

export function computeSavingsGoalProgress(
  goal: SavingsGoal,
  goalTransactions: GoalTransaction[],
  fxRates: ExchangeRateEntry[],
  referenceDateIso: string
): SavingsGoalProgress {
  const entries = goalTransactions
    .filter((e) => e.goalId === goal.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  let savedMinor = 0;
  let totalContributedMinor = 0;

  for (const e of entries) {
    const conv = convertMinorUnits(e.amountMinor, e.currency, goal.currency, fxRates);
    const amt = conv.convertedMinor ?? 0;
    if (e.kind === 'contribution') {
      savedMinor += amt;
      totalContributedMinor += amt;
    } else {
      savedMinor -= amt;
    }
  }
  savedMinor = Math.max(0, savedMinor);

  const remainingMinor = Math.max(0, goal.targetAmountMinor - savedMinor);
  const progressPct =
    goal.targetAmountMinor > 0
      ? Math.min(100, Number(((savedMinor / goal.targetAmountMinor) * 100).toFixed(1)))
      : 0;

  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  const targetMs = Date.parse(`${goal.targetDate}T00:00:00Z`);
  const daysRemaining =
    Number.isNaN(targetMs) || targetMs <= refMs ? 0 : Math.ceil((targetMs - refMs) / 86400000);
  const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30.4375));
  const requiredMonthlyMinor = remainingMinor > 0 ? Math.ceil(remainingMinor / monthsRemaining) : 0;

  let avgMonthlyContributionMinor = 0;
  if (entries.length > 0) {
    const firstMs = Date.parse(`${entries[0].date}T00:00:00Z`);
    const spanMonths = Math.max(1, (refMs - firstMs) / (86400000 * 30.4375));
    avgMonthlyContributionMinor = Math.round(totalContributedMinor / spanMonths);
  }

  let estimatedCompletionDate: string | null = null;
  if (remainingMinor === 0) {
    estimatedCompletionDate = referenceDateIso;
  } else if (avgMonthlyContributionMinor > 0) {
    const monthsNeeded = remainingMinor / avgMonthlyContributionMinor;
    const estMs = refMs + Math.ceil(monthsNeeded * 30.4375 * 86400000);
    estimatedCompletionDate = new Date(estMs).toISOString().slice(0, 10);
  }

  return {
    goal,
    savedMinor,
    remainingMinor,
    progressPct,
    daysRemaining,
    monthsRemaining,
    requiredMonthlyMinor,
    avgMonthlyContributionMinor,
    estimatedCompletionDate,
    entryCount: entries.length,
  };
}

export function normalizeToMonthlyMinor(
  amountMinor: number,
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
): number {
  switch (frequency) {
    case 'weekly':
      return Math.round((amountMinor * 52) / 12);
    case 'monthly':
      return amountMinor;
    case 'quarterly':
      return Math.round(amountMinor / 3);
    case 'yearly':
      return Math.round(amountMinor / 12);
  }
}

export function normalizeToAnnualMinor(
  amountMinor: number,
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
): number {
  switch (frequency) {
    case 'weekly':
      return amountMinor * 52;
    case 'monthly':
      return amountMinor * 12;
    case 'quarterly':
      return amountMinor * 4;
    case 'yearly':
      return amountMinor;
  }
}

export interface SubscriptionIntelligence {
  activeCount: number;
  monthlyTotalMinor: number;
  annualTotalMinor: number;
  upcomingRenewals: Subscription[];
  categoryOverlaps: Array<{ categoryLabel: string; subscriptions: Subscription[]; monthlyTotalMinor: number }>;
  userFlaggedUnused: Subscription[];
}

export function computeSubscriptionIntelligence(
  subscriptions: Subscription[],
  targetCurrency: CurrencyCode,
  fxRates: ExchangeRateEntry[],
  referenceDateIso: string
): SubscriptionIntelligence {
  const active = subscriptions.filter((s) => s.status === 'active');
  let monthlyTotalMinor = 0;
  let annualTotalMinor = 0;

  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  const in30DaysIso = new Date(refMs + 30 * 86400000).toISOString().slice(0, 10);

  const byCategory = new Map<string, { subs: Subscription[]; monthlyMinor: number }>();

  for (const sub of active) {
    const conv = convertMinorUnits(sub.amountMinor, sub.currency, targetCurrency, fxRates);
    const baseAmt = conv.convertedMinor ?? 0;
    const mAmt = normalizeToMonthlyMinor(baseAmt, sub.frequency);
    const yAmt = normalizeToAnnualMinor(baseAmt, sub.frequency);
    monthlyTotalMinor += mAmt;
    annualTotalMinor += yAmt;

    const bucket = byCategory.get(sub.categoryLabel) ?? { subs: [], monthlyMinor: 0 };
    bucket.subs.push(sub);
    bucket.monthlyMinor += mAmt;
    byCategory.set(sub.categoryLabel, bucket);
  }

  const upcomingRenewals = active
    .filter((s) => s.nextBillingDate >= referenceDateIso && s.nextBillingDate <= in30DaysIso)
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));

  const categoryOverlaps = Array.from(byCategory.entries())
    .filter(([, val]) => val.subs.length > 1)
    .map(([categoryLabel, val]) => ({
      categoryLabel,
      subscriptions: val.subs,
      monthlyTotalMinor: val.monthlyMinor,
    }))
    .sort((a, b) => b.monthlyTotalMinor - a.monthlyTotalMinor);

  const userFlaggedUnused = active.filter((s) => s.markedUnusedByUser);

  return {
    activeCount: active.length,
    monthlyTotalMinor,
    annualTotalMinor,
    upcomingRenewals,
    categoryOverlaps,
    userFlaggedUnused,
  };
}

export function computeNextOccurrenceDate(
  currentIso: string,
  frequency: RecurrenceFrequency,
  customIntervalDays = 30
): string {
  const [y, m, d] = currentIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));

  switch (frequency) {
    case 'daily':
      dt.setUTCDate(dt.getUTCDate() + 1);
      break;
    case 'weekly':
      dt.setUTCDate(dt.getUTCDate() + 7);
      break;
    case 'biweekly':
      dt.setUTCDate(dt.getUTCDate() + 14);
      break;
    case 'monthly':
      dt.setUTCMonth(dt.getUTCMonth() + 1);
      break;
    case 'quarterly':
      dt.setUTCMonth(dt.getUTCMonth() + 3);
      break;
    case 'yearly':
      dt.setUTCFullYear(dt.getUTCFullYear() + 1);
      break;
    case 'custom':
      dt.setUTCDate(dt.getUTCDate() + Math.max(1, customIntervalDays));
      break;
  }

  return dt.toISOString().slice(0, 10);
}

export function getBillAlertState(
  bill: Bill,
  referenceDateIso: string
): 'paid' | 'overdue' | 'due-soon' | 'upcoming' {
  if (bill.status === 'paid') return 'paid';
  if (bill.dueDate < referenceDateIso) return 'overdue';
  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  const dueMs = Date.parse(`${bill.dueDate}T00:00:00Z`);
  const daysUntil = Math.ceil((dueMs - refMs) / 86400000);
  if (daysUntil <= bill.reminderDaysBefore) return 'due-soon';
  return 'upcoming';
}

export interface MonthlyCashFlowPoint {
  monthKey: string; // YYYY-MM
  label: string;
  incomeMinor: number;
  expensesMinor: number;
  netCashFlowMinor: number;
}

export function computeMonthlyCashFlowSeries(
  state: FinoraLedgerState,
  monthsBack: number,
  referenceDateIso: string,
  targetCurrency: CurrencyCode = state.preferences.primaryCurrency
): MonthlyCashFlowPoint[] {
  const [refY, refM] = referenceDateIso.split('-').map(Number);
  const points: MonthlyCashFlowPoint[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(refY, refM - 1 - i, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat(state.preferences.locale, {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    }).format(dt);

    let incomeMinor = 0;
    let rawExpensesMinor = 0;
    let refundsMinor = 0;

    for (const tx of state.transactions) {
      if (tx.status !== 'completed') continue;
      if (!tx.date.startsWith(monthKey)) continue;
      if (tx.type === 'transfer' || tx.type === 'adjustment') continue;

      const conv = convertMinorUnits(tx.amountMinor, tx.currency, targetCurrency, state.fxRates);
      if (conv.convertedMinor === null) continue;

      if (tx.type === 'income') incomeMinor += conv.convertedMinor;
      else if (tx.type === 'expense') rawExpensesMinor += conv.convertedMinor;
      else if (tx.type === 'refund') refundsMinor += conv.convertedMinor;
    }

    const expensesMinor = Math.max(0, rawExpensesMinor - refundsMinor);
    points.push({
      monthKey,
      label,
      incomeMinor,
      expensesMinor,
      netCashFlowMinor: incomeMinor - expensesMinor,
    });
  }

  return points;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  amountMinor: number;
  percentage: number;
  transactionCount: number;
}

export function computeCategoryBreakdown(
  state: FinoraLedgerState,
  kind: 'expense' | 'income',
  dateRange: DateRange,
  targetCurrency: CurrencyCode = state.preferences.primaryCurrency
): CategoryBreakdownItem[] {
  const map = new Map<string, { amountMinor: number; count: number }>();

  for (const tx of state.transactions) {
    if (tx.status !== 'completed') continue;
    if (!isDateInRange(tx.date, dateRange.startDate, dateRange.endDate)) continue;

    if (kind === 'expense') {
      if (tx.type !== 'expense' && tx.type !== 'refund') continue;
    } else {
      if (tx.type !== 'income') continue;
    }

    const catId = tx.categoryId ?? 'uncategorized';
    const conv = convertMinorUnits(tx.amountMinor, tx.currency, targetCurrency, state.fxRates);
    if (conv.convertedMinor === null) continue;

    const current = map.get(catId) ?? { amountMinor: 0, count: 0 };
    if (kind === 'expense') {
      current.amountMinor += tx.type === 'refund' ? -conv.convertedMinor : conv.convertedMinor;
    } else {
      current.amountMinor += conv.convertedMinor;
    }
    current.count += 1;
    map.set(catId, current);
  }

  const positiveEntries = Array.from(map.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      amountMinor: Math.max(0, data.amountMinor),
      transactionCount: data.count,
    }))
    .filter((e) => e.amountMinor > 0);

  const total = positiveEntries.reduce((sum, e) => sum + e.amountMinor, 0);

  return positiveEntries
    .map((e) => {
      const cat = state.categories.find((c) => c.id === e.categoryId);
      return {
        categoryId: e.categoryId,
        categoryName: cat ? cat.name : 'Uncategorized',
        amountMinor: e.amountMinor,
        percentage: total > 0 ? Number(((e.amountMinor / total) * 100).toFixed(1)) : 0,
        transactionCount: e.transactionCount,
      };
    })
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export function computeRecurringSummary(
  rules: RecurringRule[],
  targetCurrency: CurrencyCode,
  fxRates: ExchangeRateEntry[]
): { monthlyIncomeMinor: number; monthlyExpensesMinor: number; activeCount: number } {
  let monthlyIncomeMinor = 0;
  let monthlyExpensesMinor = 0;
  let activeCount = 0;

  for (const r of rules) {
    if (!r.active) continue;
    activeCount += 1;
    if (r.type === 'transfer') continue;

    const conv = convertMinorUnits(r.amountMinor, r.currency, targetCurrency, fxRates);
    const amt = conv.convertedMinor ?? 0;

    let monthly = amt;
    switch (r.frequency) {
      case 'daily':
        monthly = Math.round(amt * 30.4375);
        break;
      case 'weekly':
        monthly = Math.round((amt * 52) / 12);
        break;
      case 'biweekly':
        monthly = Math.round((amt * 26) / 12);
        break;
      case 'monthly':
        monthly = amt;
        break;
      case 'quarterly':
        monthly = Math.round(amt / 3);
        break;
      case 'yearly':
        monthly = Math.round(amt / 12);
        break;
      case 'custom':
        monthly = Math.round((amt * 30.4375) / Math.max(1, r.customIntervalDays ?? 30));
        break;
    }

    if (r.type === 'income') monthlyIncomeMinor += monthly;
    else monthlyExpensesMinor += monthly;
  }

  return { monthlyIncomeMinor, monthlyExpensesMinor, activeCount };
}

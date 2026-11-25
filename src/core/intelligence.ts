import {
  computeAllAccountBalances,
  computeBudgetStatus,
  computeCategoryBreakdown,
  computeMonthlyCashFlowSeries,
  computePeriodSummary,
  computeSubscriptionIntelligence,
  resolveDateRange,
} from './accounting.ts';
import { convertMinorUnits, formatMoney, toMinorUnits } from './money.ts';
import type {
  Category,
  FinoraLedgerState,
  Transaction,
  TransactionType,
} from './types.ts';

export interface FinancialInsight {
  id: string;
  severity: 'info' | 'positive' | 'warning' | 'alert';
  title: string;
  explanation: string;
  metricLabel?: string;
}

export interface UnusualTransactionFinding {
  transaction: Transaction;
  categoryAverageMinor: number;
  ratioToAverage: number;
  reason: string;
}

export interface SmallPurchaseCluster {
  count: number;
  totalMinor: number;
  averageMinor: number;
  topMerchants: string[];
}

export interface HealthIndicator {
  id: string;
  name: string;
  valueDisplay: string;
  status: 'Healthy' | 'Moderate' | 'Needs Attention' | 'Insufficient Data';
  formula: string;
  breakdown: string;
  explanation: string;
}

export function detectUnusualTransactions(
  state: FinoraLedgerState,
  referenceDateIso: string
): UnusualTransactionFinding[] {
  const targetCurrency = state.preferences.primaryCurrency;
  const thisMonth = resolveDateRange('this-month', referenceDateIso);

  // Build historical category expense samples across completed expenses
  const samplesByCategory = new Map<string, number[]>();
  for (const tx of state.transactions) {
    if (tx.status !== 'completed' || tx.type !== 'expense') continue;
    const conv = convertMinorUnits(tx.amountMinor, tx.currency, targetCurrency, state.fxRates);
    if (conv.convertedMinor === null) continue;
    const key = tx.categoryId ?? 'uncategorized';
    const arr = samplesByCategory.get(key) ?? [];
    arr.push(conv.convertedMinor);
    samplesByCategory.set(key, arr);
  }

  const findings: UnusualTransactionFinding[] = [];
  for (const tx of state.transactions) {
    if (tx.status !== 'completed' || tx.type !== 'expense') continue;
    if (tx.date < thisMonth.startDate || tx.date > thisMonth.endDate) continue;
    const key = tx.categoryId ?? 'uncategorized';
    const samples = samplesByCategory.get(key) ?? [];
    if (samples.length < 3) continue;

    const conv = convertMinorUnits(tx.amountMinor, tx.currency, targetCurrency, state.fxRates);
    if (conv.convertedMinor === null) continue;

    const others = samples.filter((v) => v !== conv.convertedMinor);
    const baselinePool = others.length >= 2 ? others : samples;
    const avg = baselinePool.reduce((s, n) => s + n, 0) / baselinePool.length;
    if (avg <= 0) continue;

    const ratio = conv.convertedMinor / avg;
    if (ratio >= 2.2 && conv.convertedMinor >= toMinorUnits(25, targetCurrency)) {
      const catName =
        state.categories.find((c) => c.id === tx.categoryId)?.name ?? 'Uncategorized';
      findings.push({
        transaction: tx,
        categoryAverageMinor: Math.round(avg),
        ratioToAverage: Number(ratio.toFixed(1)),
        reason: `${ratio.toFixed(1)}x higher than your ${catName} average (${formatMoney(
          Math.round(avg),
          targetCurrency,
          state.preferences.locale
        )}).`,
      });
    }
  }

  return findings.sort((a, b) => b.ratioToAverage - a.ratioToAverage);
}

export function detectFrequentSmallPurchases(
  state: FinoraLedgerState,
  referenceDateIso: string
): SmallPurchaseCluster | null {
  const targetCurrency = state.preferences.primaryCurrency;
  const thresholdMinor = toMinorUnits(18, targetCurrency);
  const thisMonth = resolveDateRange('this-month', referenceDateIso);

  const smallTxs: Array<{ tx: Transaction; amt: number }> = [];
  for (const tx of state.transactions) {
    if (tx.status !== 'completed' || tx.type !== 'expense') continue;
    if (tx.date < thisMonth.startDate || tx.date > thisMonth.endDate) continue;
    const conv = convertMinorUnits(tx.amountMinor, tx.currency, targetCurrency, state.fxRates);
    if (conv.convertedMinor === null) continue;
    if (conv.convertedMinor > 0 && conv.convertedMinor <= thresholdMinor) {
      smallTxs.push({ tx, amt: conv.convertedMinor });
    }
  }

  if (smallTxs.length < 4) return null;

  const totalMinor = smallTxs.reduce((s, item) => s + item.amt, 0);
  const merchantCounts = new Map<string, number>();
  for (const item of smallTxs) {
    const m = item.tx.merchant || item.tx.description;
    merchantCounts.set(m, (merchantCounts.get(m) ?? 0) + 1);
  }
  const topMerchants = Array.from(merchantCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);

  return {
    count: smallTxs.length,
    totalMinor,
    averageMinor: Math.round(totalMinor / smallTxs.length),
    topMerchants,
  };
}

export function generateFinancialInsights(
  state: FinoraLedgerState,
  referenceDateIso: string
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const currency = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;

  const thisMonthRange = resolveDateRange('this-month', referenceDateIso);
  const lastMonthRange = resolveDateRange('last-month', referenceDateIso);

  const thisMonthSummary = computePeriodSummary(state, thisMonthRange, currency);
  const lastMonthSummary = computePeriodSummary(state, lastMonthRange, currency);

  if (thisMonthSummary.transactionCount === 0 && lastMonthSummary.transactionCount === 0) {
    return [
      {
        id: 'empty-data',
        severity: 'info',
        title: 'Add transactions to unlock real financial insights',
        explanation:
          'Finora derives every insight strictly from your recorded income, expenses, budgets, and subscriptions.',
      },
    ];
  }

  // 1. Highest spending category
  const thisMonthCats = computeCategoryBreakdown(state, 'expense', thisMonthRange, currency);
  const lastMonthCats = computeCategoryBreakdown(state, 'expense', lastMonthRange, currency);

  if (thisMonthCats.length > 0) {
    const top = thisMonthCats[0];
    insights.push({
      id: 'top-expense-category',
      severity: 'info',
      title: `Your largest expense category this month is ${top.categoryName}`,
      explanation: `${top.categoryName} accounts for ${top.percentage}% of recorded spending (${formatMoney(
        top.amountMinor,
        currency,
        locale
      )} across ${top.transactionCount} transactions).`,
      metricLabel: `${top.percentage}% of spend`,
    });
  }

  // 2. Category month-over-month increase
  let biggestIncrease: { name: string; diffMinor: number; pct: number } | null = null;
  for (const curr of thisMonthCats) {
    const prev = lastMonthCats.find((p) => p.categoryId === curr.categoryId);
    if (prev && prev.amountMinor > 0) {
      const diffMinor = curr.amountMinor - prev.amountMinor;
      const pct = Math.round((diffMinor / prev.amountMinor) * 100);
      if (diffMinor > 0 && pct >= 15) {
        if (!biggestIncrease || diffMinor > biggestIncrease.diffMinor) {
          biggestIncrease = { name: curr.categoryName, diffMinor, pct };
        }
      }
    }
  }
  if (biggestIncrease) {
    insights.push({
      id: 'category-mom-increase',
      severity: 'warning',
      title: `Your ${biggestIncrease.name.toLowerCase()} expenses increased compared with last month`,
      explanation: `${biggestIncrease.name} spending rose by ${formatMoney(
        biggestIncrease.diffMinor,
        currency,
        locale
      )} (+${biggestIncrease.pct}%) compared with the prior month.`,
      metricLabel: `+${biggestIncrease.pct}% MoM`,
    });
  }

  // 3. Budget pacing / alerts
  for (const b of state.budgets.filter((item) => item.active)) {
    const status = computeBudgetStatus(b, state.transactions, state.fxRates, referenceDateIso);
    if (status.state === 'exceeded') {
      insights.push({
        id: `budget-exceeded-${b.id}`,
        severity: 'alert',
        title: `${b.name} budget exceeded`,
        explanation: `Recorded spend is ${formatMoney(
          status.spentMinor,
          b.currency,
          locale
        )} against a limit of ${formatMoney(status.effectiveLimitMinor, b.currency, locale)}.`,
        metricLabel: `${status.utilizationPct}% used`,
      });
    } else if (status.projectedSpendMinor > status.effectiveLimitMinor) {
      insights.push({
        id: `budget-projected-${b.id}`,
        severity: 'warning',
        title: `Your current spending rate may exceed your ${b.name} budget`,
        explanation: `At the current daily pace, projected spend reaches ${formatMoney(
          status.projectedSpendMinor,
          b.currency,
          locale
        )} versus a ${formatMoney(status.effectiveLimitMinor, b.currency, locale)} budget.`,
        metricLabel: `Projected ${Math.round(
          (status.projectedSpendMinor / Math.max(1, status.effectiveLimitMinor)) * 100
        )}%`,
      });
    }
  }

  // 4. Recurring & subscription burden
  const subIntel = computeSubscriptionIntelligence(
    state.subscriptions,
    currency,
    state.fxRates,
    referenceDateIso
  );
  if (thisMonthSummary.netExpensesMinor > 0 && subIntel.monthlyTotalMinor > 0) {
    const sharePct = Math.round(
      (subIntel.monthlyTotalMinor / thisMonthSummary.netExpensesMinor) * 100
    );
    if (sharePct >= 15) {
      insights.push({
        id: 'recurring-burden',
        severity: sharePct >= 35 ? 'warning' : 'info',
        title: 'Subscriptions represent a notable share of monthly expenses',
        explanation: `Active subscriptions total ${formatMoney(
          subIntel.monthlyTotalMinor,
          currency,
          locale
        )}/month (${formatMoney(
          subIntel.annualTotalMinor,
          currency,
          locale
        )}/year), equivalent to ${sharePct}% of this month's net expenses.`,
        metricLabel: `${sharePct}% of spend`,
      });
    }
  }

  // 5. Frequent small purchases
  const smallCluster = detectFrequentSmallPurchases(state, referenceDateIso);
  if (smallCluster) {
    insights.push({
      id: 'small-purchases',
      severity: 'info',
      title: `${smallCluster.count} small purchases accumulated to ${formatMoney(
        smallCluster.totalMinor,
        currency,
        locale
      )}`,
      explanation: `Frequent smaller transactions (averaging ${formatMoney(
        smallCluster.averageMinor,
        currency,
        locale
      )}) occurred at ${smallCluster.topMerchants.join(', ')}.`,
      metricLabel: `${smallCluster.count} transactions`,
    });
  }

  // 6. Savings consistency
  const recentGoalContributions = state.goalTransactions.filter((g) => g.kind === 'contribution');
  const uniqueGoalMonths = new Set(recentGoalContributions.map((g) => g.date.slice(0, 7)));
  if (uniqueGoalMonths.size >= 2) {
    insights.push({
      id: 'savings-consistency',
      severity: 'positive',
      title: 'Your savings contributions have been consistent',
      explanation: `You recorded savings contributions across ${uniqueGoalMonths.size} distinct months (${recentGoalContributions.length} total deposits).`,
      metricLabel: `${uniqueGoalMonths.size} active months`,
    });
  }

  // 7. Unusual transaction detection
  const unusual = detectUnusualTransactions(state, referenceDateIso);
  if (unusual.length > 0) {
    const top = unusual[0];
    insights.push({
      id: `unusual-${top.transaction.id}`,
      severity: 'warning',
      title: `Unusual expense detected: ${top.transaction.merchant || top.transaction.description}`,
      explanation: `${formatMoney(
        top.transaction.amountMinor,
        top.transaction.currency,
        locale
      )} on ${top.transaction.date} is ${top.reason}`,
      metricLabel: `${top.ratioToAverage}x avg`,
    });
  }

  return insights;
}

export function computeFinancialHealthIndicators(
  state: FinoraLedgerState,
  referenceDateIso: string
): HealthIndicator[] {
  const currency = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;
  const thisMonth = resolveDateRange('this-month', referenceDateIso);
  const summary = computePeriodSummary(state, thisMonth, currency);
  const series = computeMonthlyCashFlowSeries(state, 3, referenceDateIso, currency);

  // 1. Savings Rate
  let savingsIndicator: HealthIndicator;
  if (summary.totalIncomeMinor <= 0) {
    savingsIndicator = {
      id: 'savings-rate',
      name: 'Savings Rate',
      valueDisplay: 'No income recorded',
      status: 'Insufficient Data',
      formula: '(Monthly Income - Net Monthly Expenses) / Monthly Income',
      breakdown: 'Requires at least one completed income transaction this month.',
      explanation: 'Measures the percentage of monthly income retained after expenses.',
    };
  } else {
    const rate = summary.savingsRatePct ?? 0;
    savingsIndicator = {
      id: 'savings-rate',
      name: 'Savings Rate',
      valueDisplay: `${rate}%`,
      status: rate >= 20 ? 'Healthy' : rate >= 5 ? 'Moderate' : 'Needs Attention',
      formula: '(Monthly Income - Net Monthly Expenses) / Monthly Income',
      breakdown: `(${formatMoney(summary.totalIncomeMinor, currency, locale)} - ${formatMoney(
        summary.netExpensesMinor,
        currency,
        locale
      )}) / ${formatMoney(summary.totalIncomeMinor, currency, locale)}`,
      explanation:
        'Shows what share of your income stays unspent this month. Many households target 15–20% or higher depending on obligations.',
    };
  }

  // 2. Monthly Cash Flow Margin
  const cashFlowStatus =
    summary.totalIncomeMinor === 0 && summary.netExpensesMinor === 0
      ? 'Insufficient Data'
      : summary.netCashFlowMinor > 0
      ? 'Healthy'
      : summary.netCashFlowMinor === 0
      ? 'Moderate'
      : 'Needs Attention';

  const cashFlowIndicator: HealthIndicator = {
    id: 'cash-flow',
    name: 'Monthly Cash Flow',
    valueDisplay: formatMoney(summary.netCashFlowMinor, currency, locale, { showPlus: true }),
    status: cashFlowStatus,
    formula: 'Monthly Income - Net Monthly Expenses (excluding internal transfers)',
    breakdown: `${formatMoney(summary.totalIncomeMinor, currency, locale)} in vs ${formatMoney(
      summary.netExpensesMinor,
      currency,
      locale
    )} out`,
    explanation: 'Positive net cash flow grows liquid balances; negative cash flow draws down reserves.',
  };

  // 3. Budget Adherence
  const activeBudgets = state.budgets.filter((b) => b.active);
  let budgetIndicator: HealthIndicator;
  if (activeBudgets.length === 0) {
    budgetIndicator = {
      id: 'budget-adherence',
      name: 'Budget Adherence',
      valueDisplay: 'No active budgets',
      status: 'Insufficient Data',
      formula: 'Active Budgets Within Limit / Total Active Budgets',
      breakdown: 'Create at least one budget to track adherence.',
      explanation: 'Tracks how many active spending budgets remain within their configured limits.',
    };
  } else {
    const statuses = activeBudgets.map((b) =>
      computeBudgetStatus(b, state.transactions, state.fxRates, referenceDateIso)
    );
    const withinLimit = statuses.filter((s) => s.state !== 'exceeded').length;
    const adherencePct = Math.round((withinLimit / statuses.length) * 100);
    budgetIndicator = {
      id: 'budget-adherence',
      name: 'Budget Adherence',
      valueDisplay: `${adherencePct}% (${withinLimit}/${statuses.length})`,
      status: adherencePct === 100 ? 'Healthy' : adherencePct >= 70 ? 'Moderate' : 'Needs Attention',
      formula: 'Active Budgets Not Exceeded / Total Active Budgets',
      breakdown: `${withinLimit} of ${statuses.length} active budgets are within their spending limit.`,
      explanation: 'Indicates whether category and overall spending stay inside planned thresholds.',
    };
  }

  // 4. Recurring Expense Burden (Subscriptions + Active Bills)
  const subIntel = computeSubscriptionIntelligence(
    state.subscriptions,
    currency,
    state.fxRates,
    referenceDateIso
  );
  const recurringOutflowMinor =
    subIntel.monthlyTotalMinor +
    state.bills
      .filter((b) => b.frequency === 'monthly')
      .reduce((s, b) => s + (convertMinorUnits(b.amountMinor, b.currency, currency, state.fxRates).convertedMinor ?? 0), 0);

  let recurringIndicator: HealthIndicator;
  if (summary.totalIncomeMinor <= 0) {
    recurringIndicator = {
      id: 'recurring-burden',
      name: 'Recurring Expense Burden',
      valueDisplay: formatMoney(recurringOutflowMinor, currency, locale),
      status: 'Insufficient Data',
      formula: '(Monthly Subscriptions + Monthly Bills) / Monthly Income',
      breakdown: `${formatMoney(recurringOutflowMinor, currency, locale)} committed monthly; waiting for income data.`,
      explanation: 'Measures fixed monthly commitments relative to income.',
    };
  } else {
    const burdenPct = Math.round((recurringOutflowMinor / summary.totalIncomeMinor) * 100);
    recurringIndicator = {
      id: 'recurring-burden',
      name: 'Recurring Expense Burden',
      valueDisplay: `${burdenPct}%`,
      status: burdenPct <= 45 ? 'Healthy' : burdenPct <= 65 ? 'Moderate' : 'Needs Attention',
      formula: '(Monthly Subscriptions + Monthly Bills) / Monthly Income',
      breakdown: `${formatMoney(recurringOutflowMinor, currency, locale)} fixed commitments / ${formatMoney(
        summary.totalIncomeMinor,
        currency,
        locale
      )} income`,
      explanation: 'Lower recurring commitments preserve flexibility for savings and variable needs.',
    };
  }

  // 5. Emergency Savings Runway
  const balances = computeAllAccountBalances(state.accounts, state.transactions, state.fxRates);
  let liquidSavingsMinor = 0;
  for (const acc of state.accounts) {
    if (acc.archived) continue;
    if (acc.type === 'savings' || acc.type === 'checking' || acc.type === 'cash' || acc.type === 'e_wallet') {
      const bal = balances[acc.id] ?? 0;
      if (bal > 0) {
        const conv = convertMinorUnits(bal, acc.currency, currency, state.fxRates);
        liquidSavingsMinor += conv.convertedMinor ?? 0;
      }
    }
  }
  const activeMonths = series.filter((m) => m.expensesMinor > 0);
  const avgMonthlySpendMinor =
    activeMonths.length > 0
      ? Math.round(activeMonths.reduce((s, m) => s + m.expensesMinor, 0) / activeMonths.length)
      : 0;

  let emergencyIndicator: HealthIndicator;
  if (avgMonthlySpendMinor <= 0) {
    emergencyIndicator = {
      id: 'emergency-runway',
      name: 'Liquid Runway',
      valueDisplay: formatMoney(liquidSavingsMinor, currency, locale),
      status: 'Insufficient Data',
      formula: 'Liquid Positive Account Balances / Average Monthly Expenses',
      breakdown: 'Requires expense history to estimate months of expense coverage.',
      explanation: 'Estimates how many months current liquid balances could cover average monthly spending.',
    };
  } else {
    const monthsCovered = Number((liquidSavingsMinor / avgMonthlySpendMinor).toFixed(1));
    emergencyIndicator = {
      id: 'emergency-runway',
      name: 'Liquid Runway',
      valueDisplay: `${monthsCovered} months`,
      status: monthsCovered >= 3 ? 'Healthy' : monthsCovered >= 1 ? 'Moderate' : 'Needs Attention',
      formula: 'Liquid Positive Balances / 3-Month Avg Expenses',
      breakdown: `${formatMoney(liquidSavingsMinor, currency, locale)} liquid / ${formatMoney(
        avgMonthlySpendMinor,
        currency,
        locale
      )} avg monthly expenses`,
      explanation: '3–6 months of liquid runway provides resilience against unexpected income drops or bills.',
    };
  }

  // 6. Spending Consistency (Coefficient of variation over 3 months)
  let consistencyIndicator: HealthIndicator;
  if (activeMonths.length < 2) {
    consistencyIndicator = {
      id: 'spending-consistency',
      name: 'Spending Consistency',
      valueDisplay: `${activeMonths.length} month recorded`,
      status: 'Insufficient Data',
      formula: 'Standard Deviation / Mean of Monthly Expenses (3 months)',
      breakdown: 'Requires at least 2 months of expense history to measure variance.',
      explanation: 'Tracks how predictable your month-to-month spending totals are.',
    };
  } else {
    const vals = activeMonths.map((m) => m.expensesMinor);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const cvPct = mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100) : 0;
    consistencyIndicator = {
      id: 'spending-consistency',
      name: 'Spending Consistency',
      valueDisplay: `${cvPct}% variance`,
      status: cvPct <= 18 ? 'Healthy' : cvPct <= 35 ? 'Moderate' : 'Needs Attention',
      formula: 'StdDev(Monthly Expenses) / Mean(Monthly Expenses)',
      breakdown: `Measured across ${activeMonths.length} active months averaging ${formatMoney(
        Math.round(mean),
        currency,
        locale
      )}/mo.`,
      explanation: 'Lower month-to-month variance makes cash flow and budget forecasting more reliable.',
    };
  }

  return [
    savingsIndicator,
    cashFlowIndicator,
    budgetIndicator,
    recurringIndicator,
    emergencyIndicator,
    consistencyIndicator,
  ];
}

export interface TransactionIntelligenceSuggestion {
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestionReason: string | null;
  normalizedMerchant: string | null;
  potentialDuplicate: Transaction | null;
}

const KEYWORD_CATEGORY_HINTS: Array<{ keywords: string[]; categoryNames: string[] }> = [
  { keywords: ['whole foods', 'trader joe', 'grocery', 'supermarket', 'aldi', 'market'], categoryNames: ['Groceries', 'Food & Dining'] },
  { keywords: ['coffee', 'starbucks', 'blue bottle', 'cafe', 'restaurant', 'uber eats', 'doordash', 'bistro'], categoryNames: ['Dining Out', 'Food & Dining', 'Groceries'] },
  { keywords: ['uber', 'lyft', 'metro', 'transit', 'shell', 'chevron', 'gas', 'airline', 'flight'], categoryNames: ['Transportation', 'Travel'] },
  { keywords: ['rent', 'lease', 'apartment', 'mortgage', 'landlord'], categoryNames: ['Housing & Rent'] },
  { keywords: ['electric', 'water', 'pg&e', 'coned', 'internet', 'comcast', 'verizon', 'at&t'], categoryNames: ['Utilities & Internet'] },
  { keywords: ['netflix', 'spotify', 'icloud', 'apple', 'adobe', 'figma', 'notion', 'openai', 'youtube'], categoryNames: ['Subscriptions & Software'] },
  { keywords: ['pharmacy', 'cvs', 'walgreens', 'clinic', 'doctor', 'dental', 'health'], categoryNames: ['Healthcare'] },
  { keywords: ['payroll', 'salary', 'direct deposit', 'employer'], categoryNames: ['Salary'] },
  { keywords: ['stripe', 'invoice', 'client', 'consulting', 'freelance'], categoryNames: ['Freelance'] },
  { keywords: ['dividend', 'interest', 'vanguard', 'fidelity'], categoryNames: ['Investments'] },
];

export function suggestTransactionIntelligence(
  draft: {
    type: TransactionType;
    description: string;
    merchant: string;
    amountMinor: number;
    date: string;
    accountId: string;
    excludeId?: string;
  },
  existingTransactions: Transaction[],
  categories: Category[]
): TransactionIntelligenceSuggestion {
  const query = `${draft.merchant} ${draft.description}`.trim().toLowerCase();

  let suggestedCategoryId: string | null = null;
  let suggestedCategoryName: string | null = null;
  let suggestionReason: string | null = null;
  let normalizedMerchant: string | null = null;

  if (query.length >= 2) {
    // 1. Check historical exact/partial merchant or description match
    const targetKind = draft.type === 'income' ? 'income' : 'expense';
    const eligibleCategories = categories.filter((c) => !c.archived && c.kind === targetKind);

    const historyMatch = existingTransactions.find((tx) => {
      if (tx.id === draft.excludeId || !tx.categoryId) return false;
      const m = tx.merchant.toLowerCase();
      const d = tx.description.toLowerCase();
      return (m && query.includes(m)) || (d && query.includes(d));
    });

    if (historyMatch && historyMatch.categoryId) {
      const cat = eligibleCategories.find((c) => c.id === historyMatch.categoryId);
      if (cat) {
        suggestedCategoryId = cat.id;
        suggestedCategoryName = cat.name;
        suggestionReason = `Matched prior transaction "${historyMatch.merchant || historyMatch.description}"`;
        normalizedMerchant = historyMatch.merchant || null;
      }
    }

    // 2. Fallback to keyword heuristics
    if (!suggestedCategoryId) {
      for (const hint of KEYWORD_CATEGORY_HINTS) {
        if (hint.keywords.some((kw) => query.includes(kw))) {
          const cat = eligibleCategories.find((c) =>
            hint.categoryNames.some((n) => c.name.toLowerCase() === n.toLowerCase())
          );
          if (cat) {
            suggestedCategoryId = cat.id;
            suggestedCategoryName = cat.name;
            suggestionReason = `Recognized keyword in "${draft.merchant || draft.description}"`;
            break;
          }
        }
      }
    }
  }

  // 3. Duplicate transaction warning (same amount + within 2 days + matching merchant/description or account)
  let potentialDuplicate: Transaction | null = null;
  if (draft.amountMinor > 0 && draft.date) {
    const draftMs = Date.parse(`${draft.date}T00:00:00Z`);
    potentialDuplicate =
      existingTransactions.find((tx) => {
        if (tx.id === draft.excludeId) return false;
        if (tx.amountMinor !== draft.amountMinor) return false;
        if (tx.type !== draft.type) return false;
        const txMs = Date.parse(`${tx.date}T00:00:00Z`);
        const dayDiff = Math.abs(draftMs - txMs) / 86400000;
        if (dayDiff > 2) return false;
        const sameAcc = tx.accountId === draft.accountId;
        const textA = (tx.merchant || tx.description).toLowerCase();
        const textB = (draft.merchant || draft.description).toLowerCase();
        const textOverlap = !textB || !textA || textA.includes(textB) || textB.includes(textA);
        return sameAcc && textOverlap;
      }) ?? null;
  }

  return {
    suggestedCategoryId,
    suggestedCategoryName,
    suggestionReason,
    normalizedMerchant,
    potentialDuplicate,
  };
}

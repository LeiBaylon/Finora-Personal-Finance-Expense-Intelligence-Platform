import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAccountBalanceMinor,
  computeBudgetStatus,
  computeNextOccurrenceDate,
  computePeriodSummary,
  computeSavingsGoalProgress,
  computeSubscriptionIntelligence,
  resolveDateRange,
} from './accounting';
import { buildImportPreview, guessColumnMapping, parseCsvText, transactionsToCsv } from './importExport';
import { computeFinancialHealthIndicators, generateFinancialInsights, suggestTransactionIntelligence } from './intelligence';
import { convertMinorUnits, formatMoney, toMinorUnits } from './money';
import { createEmptyLedgerState, createSampleLedgerState } from './seedData';

test('toMinorUnits and formatMoney handle precision without float drift', () => {
  assert.equal(toMinorUnits('19.99', 'USD'), 1999);
  assert.equal(toMinorUnits('10.1', 'USD'), 1010);
  assert.equal(toMinorUnits(0.1 + 0.2, 'USD'), 30);
  assert.equal(toMinorUnits('1500', 'JPY'), 1500);
  assert.equal(formatMoney(1999, 'USD', 'en-US'), '$19.99');
  assert.equal(formatMoney(-4500, 'USD', 'en-US'), '-$45.00');
});

test('convertMinorUnits never fabricates missing exchange rates', () => {
  const rates = [
    { base: 'EUR' as const, quote: 'USD' as const, rate: 1.1, updatedAt: '2026-11-25T00:00:00Z', source: 'Test' },
  ];
  const direct = convertMinorUnits(10000, 'EUR', 'USD', rates);
  assert.equal(direct.missingRate, false);
  assert.equal(direct.convertedMinor, 11000);

  const missing = convertMinorUnits(10000, 'GBP', 'USD', rates);
  assert.equal(missing.missingRate, true);
  assert.equal(missing.convertedMinor, null);
});

test('account balances reconcile income, expenses, refunds, adjustments, and transfers while ignoring scheduled items', () => {
  const state = createEmptyLedgerState('USD');
  state.accounts = [
    {
      id: 'checking',
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      openingBalanceMinor: 100000,
      description: '',
      includeInTotal: true,
      archived: false,
      createdAt: '2026-11-01',
    },
    {
      id: 'savings',
      name: 'Savings',
      type: 'savings',
      currency: 'USD',
      openingBalanceMinor: 50000,
      description: '',
      includeInTotal: true,
      archived: false,
      createdAt: '2026-11-01',
    },
  ];
  state.transactions = [
    {
      id: 't1',
      type: 'income',
      description: 'Paycheck',
      amountMinor: 200000,
      currency: 'USD',
      date: '2026-11-05',
      categoryId: 'cat-salary',
      accountId: 'checking',
      paymentMethod: 'ACH',
      merchant: 'Acme',
      notes: '',
      tags: [],
      status: 'completed',
      createdAt: '2026-11-05',
      updatedAt: '2026-11-05',
    },
    {
      id: 't2',
      type: 'expense',
      description: 'Groceries',
      amountMinor: 15000,
      currency: 'USD',
      date: '2026-11-06',
      categoryId: 'cat-groceries',
      accountId: 'checking',
      paymentMethod: 'Card',
      merchant: 'Whole Foods',
      notes: '',
      tags: [],
      status: 'completed',
      createdAt: '2026-11-06',
      updatedAt: '2026-11-06',
    },
    {
      id: 't3',
      type: 'refund',
      description: 'Grocery Return',
      amountMinor: 2000,
      currency: 'USD',
      date: '2026-11-07',
      categoryId: 'cat-groceries',
      accountId: 'checking',
      paymentMethod: 'Card',
      merchant: 'Whole Foods',
      notes: '',
      tags: [],
      status: 'completed',
      createdAt: '2026-11-07',
      updatedAt: '2026-11-07',
    },
    {
      id: 't4',
      type: 'transfer',
      description: 'Move to Savings',
      amountMinor: 50000,
      currency: 'USD',
      date: '2026-11-08',
      categoryId: null,
      accountId: 'checking',
      toAccountId: 'savings',
      paymentMethod: 'Transfer',
      merchant: 'Savings',
      notes: '',
      tags: [],
      status: 'completed',
      createdAt: '2026-11-08',
      updatedAt: '2026-11-08',
    },
    {
      id: 't5-scheduled',
      type: 'expense',
      description: 'Future Rent',
      amountMinor: 100000,
      currency: 'USD',
      date: '2026-12-01',
      categoryId: 'cat-housing',
      accountId: 'checking',
      paymentMethod: 'ACH',
      merchant: 'Landlord',
      notes: '',
      tags: [],
      status: 'scheduled',
      createdAt: '2026-11-08',
      updatedAt: '2026-11-08',
    },
  ];

  // Checking: 1000 + 2000 - 150 + 20 - 500 = 2370.00
  assert.equal(computeAccountBalanceMinor(state.accounts[0], state.transactions), 237000);
  // Savings: 500 + 500 = 1000.00
  assert.equal(computeAccountBalanceMinor(state.accounts[1], state.transactions), 100000);

  // Period summary: transfers never count as income or expense; refunds offset expenses
  const range = resolveDateRange('this-month', '2026-11-25');
  const summary = computePeriodSummary(state, range, 'USD');
  assert.equal(summary.totalIncomeMinor, 200000);
  assert.equal(summary.totalExpensesMinor, 15000);
  assert.equal(summary.totalRefundsMinor, 2000);
  assert.equal(summary.netExpensesMinor, 13000);
  assert.equal(summary.netCashFlowMinor, 187000);
  assert.equal(summary.totalAvailableBalanceMinor, 337000);
});

test('budget calculations support carry-over, refunds, and alert thresholds', () => {
  const state = createSampleLedgerState('2026-11-25');
  const groceryBudget = state.budgets.find((b) => b.id === 'bud-groceries')!;
  const status = computeBudgetStatus(groceryBudget, state.transactions, state.fxRates, '2026-11-25');
  // 650.00 + 45.00 carryOver = 695.00 effective limit
  assert.equal(status.effectiveLimitMinor, 69500);
  // 248.50 + 189.00 + 162.00 = 599.50 spent -> 86.3% > 80% threshold -> approaching
  assert.equal(status.spentMinor, 59950);
  assert.equal(status.state, 'approaching');
});

test('savings goal progress computes required monthly contributions and completion estimates', () => {
  const state = createSampleLedgerState('2026-11-25');
  const goal = state.savingsGoals[0];
  const progress = computeSavingsGoalProgress(goal, state.goalTransactions, state.fxRates, '2026-11-25');
  // Contributions: 12000 + 1200 + 1500 + 1100 = 15800
  assert.equal(progress.savedMinor, 1580000);
  assert.equal(progress.remainingMinor, 820000);
  assert.ok(progress.requiredMonthlyMinor > 0);
  assert.ok(progress.estimatedCompletionDate !== null);
});

test('subscription intelligence computes annualized costs, overlaps, and respects manual unused flag', () => {
  const state = createSampleLedgerState('2026-11-25');
  const intel = computeSubscriptionIntelligence(state.subscriptions, 'USD', state.fxRates, '2026-11-25');
  assert.equal(intel.activeCount, 6);
  assert.equal(intel.categoryOverlaps.length, 3); // Cloud Storage + Software + Streaming
  assert.equal(intel.userFlaggedUnused.length, 1);
  assert.equal(intel.userFlaggedUnused[0].id, 'sub-adobe');
  assert.ok(intel.annualTotalMinor > intel.monthlyTotalMinor * 11);
});

test('recurring next occurrence advances properly across frequencies', () => {
  assert.equal(computeNextOccurrenceDate('2026-11-25', 'weekly'), '2026-12-02');
  assert.equal(computeNextOccurrenceDate('2026-11-25', 'monthly'), '2026-12-25');
  assert.equal(computeNextOccurrenceDate('2026-11-25', 'custom', 10), '2026-12-05');
});

test('intelligence engine generates real data-backed insights, health formulas, and duplicate warnings', () => {
  const state = createSampleLedgerState('2026-11-25');
  const insights = generateFinancialInsights(state, '2026-11-25');
  assert.ok(insights.length >= 4);

  const health = computeFinancialHealthIndicators(state, '2026-11-25');
  assert.equal(health.length, 6);
  assert.ok(health.every((h) => h.formula.length > 0 && h.breakdown.length > 0));

  const suggestion = suggestTransactionIntelligence(
    {
      type: 'expense',
      description: 'Whole Foods Weekly Provision',
      merchant: 'Whole Foods Market',
      amountMinor: 24850,
      date: '2026-11-05',
      accountId: 'acc-credit',
    },
    state.transactions,
    state.categories
  );
  assert.equal(suggestion.suggestedCategoryId, 'cat-groceries');
  assert.ok(suggestion.potentialDuplicate !== null);
});

test('CSV import parser, mapping, duplicate detection, and formula-safe export work accurately', () => {
  const csv = [
    'Date,Description,Amount,Category',
    '2026-11-04,"Whole Foods Market",-248.50,Groceries',
    '2026-11-22,"Coffee Shop",-5.25,Dining Out',
    'bad-date,"Broken Row",not-a-number,Other',
  ].join('\n');

  const parsed = parseCsvText(csv);
  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.rows.length, 3);

  const mapping = guessColumnMapping(parsed.headers);
  const state = createSampleLedgerState('2026-11-25');
  const preview = buildImportPreview(
    parsed,
    mapping,
    'acc-credit',
    'USD',
    state.transactions,
    state.categories,
    {}
  );

  assert.equal(preview[0].isDuplicate, true);
  assert.equal(preview[1].valid, true);
  assert.equal(preview[1].isDuplicate, false);
  assert.equal(preview[1].amountMinor, 525);
  assert.equal(preview[2].valid, false);

  // Formula-injection safety check on export
  const state2 = createEmptyLedgerState('USD');
  state2.transactions.push({
    id: 'inj',
    type: 'expense',
    description: '=CMD()',
    amountMinor: 100,
    currency: 'USD',
    date: '2026-11-25',
    categoryId: null,
    accountId: 'acc-primary',
    paymentMethod: 'Card',
    merchant: '+EVIL',
    notes: '',
    tags: [],
    status: 'completed',
    createdAt: '2026-11-25',
    updatedAt: '2026-11-25',
  });
  const exported = transactionsToCsv(state2.transactions, state2);
  assert.ok(exported.includes("'=CMD()"));
  assert.ok(exported.includes("'+EVIL"));
});

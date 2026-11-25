import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarClock,
  Eye,
  EyeOff,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  computeBudgetStatus,
  computeCategoryBreakdown,
  computeMonthlyCashFlowSeries,
  computePeriodSummary,
  computeRecurringSummary,
  computeSavingsGoalProgress,
  computeSubscriptionIntelligence,
  getBillAlertState,
} from '../../core/accounting';
import { generateFinancialInsights } from '../../core/intelligence';
import { formatDisplayDate, formatMoney } from '../../core/money';
import type { DashboardWidgetId, DateRangePreset } from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import {
  CashFlowBarChart,
  CategoryDonutChart,
  UtilizationBar,
} from '../charts/FinoraCharts';
import { TransactionModal } from '../modals/TransactionModal';
import {
  CurrencyText,
  EmptyState,
  GlassCard,
  GlassModal,
  SectionHeader,
  SegmentedControl,
} from '../ui/GlassPrimitives';

const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  kpis: 'Core Financial KPIs',
  'cashflow-chart': 'Income vs Expenses Cash Flow',
  'category-distribution': 'Expense Distribution by Category',
  'budget-utilization': 'Budget Utilization',
  'savings-progress': 'Active Savings Goals',
  'upcoming-payments': 'Upcoming Bills & Recurring',
  'recent-transactions': 'Recent Transactions',
  'quick-insights': 'Financial Insights',
};

export const DashboardView: React.FC<{
  onInspectCategory?: (categoryId: string) => void;
}> = ({ onInspectCategory }) => {
  const {
    state,
    dateRange,
    setDateRangePreset,
    referenceDate,
    setActiveWorkspace,
    updatePreferences,
    clearSampleDataAndStartFresh,
  } = useLedger();

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [inspectMonth, setInspectMonth] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState(dateRange.startDate);
  const [customEnd, setCustomEnd] = useState(dateRange.endDate);

  const summary = useMemo(
    () => (state ? computePeriodSummary(state, dateRange) : null),
    [state, dateRange]
  );

  const cashFlowSeries = useMemo(
    () => (state ? computeMonthlyCashFlowSeries(state, 6, referenceDate) : []),
    [state, referenceDate]
  );

  const categoryBreakdown = useMemo(
    () => (state ? computeCategoryBreakdown(state, 'expense', dateRange) : []),
    [state, dateRange]
  );

  const budgetStatuses = useMemo(
    () =>
      state
        ? state.budgets
            .filter((b) => b.active)
            .map((b) => computeBudgetStatus(b, state.transactions, state.fxRates, referenceDate))
        : [],
    [state, referenceDate]
  );

  const goalProgressList = useMemo(
    () =>
      state
        ? state.savingsGoals.map((g) =>
            computeSavingsGoalProgress(g, state.goalTransactions, state.fxRates, referenceDate)
          )
        : [],
    [state, referenceDate]
  );

  const subIntel = useMemo(
    () =>
      state
        ? computeSubscriptionIntelligence(
            state.subscriptions,
            state.preferences.primaryCurrency,
            state.fxRates,
            referenceDate
          )
        : null,
    [state, referenceDate]
  );

  const recurringSummary = useMemo(
    () =>
      state
        ? computeRecurringSummary(
            state.recurringRules,
            state.preferences.primaryCurrency,
            state.fxRates
          )
        : null,
    [state]
  );

  const insights = useMemo(
    () => (state ? generateFinancialInsights(state, referenceDate).slice(0, 4) : []),
    [state, referenceDate]
  );

  if (!state || !summary || !subIntel || !recurringSummary) return null;

  const currency = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;

  const upcomingBills = state.bills
    .filter((b) => b.status === 'unpaid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const recentTransactions = state.transactions
    .filter((t) => t.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const inspectedMonthTxs = inspectMonth
    ? state.transactions.filter((t) => t.status === 'completed' && t.date.startsWith(inspectMonth))
    : [];

  const widgetOrder = state.preferences.dashboardWidgetOrder;
  const hiddenSet = new Set(state.preferences.hiddenDashboardWidgets);

  const toggleWidgetVisibility = (id: DashboardWidgetId) => {
    const next = hiddenSet.has(id)
      ? state.preferences.hiddenDashboardWidgets.filter((w) => w !== id)
      : [...state.preferences.hiddenDashboardWidgets, id];
    updatePreferences({ hiddenDashboardWidgets: next });
  };

  const moveWidget = (id: DashboardWidgetId, dir: -1 | 1) => {
    const idx = widgetOrder.indexOf(id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= widgetOrder.length) return;
    const next = [...widgetOrder];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    updatePreferences({ dashboardWidgetOrder: next });
  };

  const renderWidget = (widgetId: DashboardWidgetId) => {
    if (hiddenSet.has(widgetId)) return null;

    switch (widgetId) {
      case 'kpis':
        return (
          <div key={widgetId} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <GlassCard variant="primary" className="flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>Total Available Balance</span>
                <span>{state.accounts.filter((a) => !a.archived && a.includeInTotal).length} accounts</span>
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                <CurrencyText minor={summary.totalAvailableBalanceMinor} currency={currency} locale={locale} />
              </div>
              <div className="mt-2 text-xs text-white/45">
                Reconciled from opening balances and completed transactions
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>Total Income</span>
                <span>{dateRange.startDate} to {dateRange.endDate}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold text-emerald-400">
                <CurrencyText minor={summary.totalIncomeMinor} currency={currency} locale={locale} showPlus />
              </div>
              <div className="mt-2 text-xs text-white/45">Excludes internal transfers</div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>Total Expenses (Net)</span>
                {summary.totalRefundsMinor > 0 && (
                  <span>
                    Refunds: <CurrencyText minor={summary.totalRefundsMinor} currency={currency} locale={locale} />
                  </span>
                )}
              </div>
              <div className="mt-3 text-2xl font-semibold text-red-400">
                <CurrencyText minor={summary.netExpensesMinor} currency={currency} locale={locale} />
              </div>
              <div className="mt-2 text-xs text-white/45">
                {summary.transactionCount} completed entries in range
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>Net Cash Flow</span>
                <span>
                  {summary.savingsRatePct !== null ? `${summary.savingsRatePct}% savings rate` : 'No income in range'}
                </span>
              </div>
              <div
                className={`mt-3 text-2xl font-semibold ${
                  summary.netCashFlowMinor >= 0 ? 'text-white' : 'text-red-400'
                }`}
              >
                <CurrencyText
                  minor={summary.netCashFlowMinor}
                  currency={currency}
                  locale={locale}
                  showPlus
                />
              </div>
              <div className="mt-2 text-xs text-white/45">Income minus net expenses</div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>Budget Utilization</span>
                <button
                  type="button"
                  onClick={() => setActiveWorkspace('budgets')}
                  className="text-white/70 hover:text-white inline-flex items-center gap-0.5"
                >
                  Budgets <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
              <div className="mt-3 text-2xl font-semibold font-mono-num text-white">
                {summary.budgetUtilizationPct !== null ? `${summary.budgetUtilizationPct}%` : 'No budgets'}
              </div>
              <div className="mt-2.5">
                <UtilizationBar
                  pct={summary.budgetUtilizationPct ?? 0}
                  tone={
                    (summary.budgetUtilizationPct ?? 0) > 100
                      ? 'danger'
                      : (summary.budgetUtilizationPct ?? 0) >= 80
                      ? 'warning'
                      : 'neutral'
                  }
                />
              </div>
              <div className="mt-2 text-xs text-white/45">
                Across {budgetStatuses.length} active {budgetStatuses.length === 1 ? 'budget' : 'budgets'}
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center justify-between text-xs text-white/55">
                <span>Recurring &amp; Subscriptions</span>
                <button
                  type="button"
                  onClick={() => setActiveWorkspace('bills')}
                  className="text-white/70 hover:text-white inline-flex items-center gap-0.5"
                >
                  Manage <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                <CurrencyText
                  minor={subIntel.monthlyTotalMinor + recurringSummary.monthlyExpensesMinor}
                  currency={currency}
                  locale={locale}
                />
                <span className="text-xs font-normal text-white/50"> / mo</span>
              </div>
              <div className="mt-2 text-xs text-white/45">
                {subIntel.activeCount} active subscriptions · {upcomingBills.length} unpaid bills
              </div>
            </GlassCard>
          </div>
        );

      case 'cashflow-chart':
        return (
          <GlassCard key={widgetId}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Income vs Expenses &amp; Cash Flow</h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Click any month bar to inspect underlying transactions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace('transactions')}
                className="text-xs text-white/65 hover:text-white glass-interactive px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                View Ledger
              </button>
            </div>
            <CashFlowBarChart
              data={cashFlowSeries}
              currency={currency}
              locale={locale}
              onSelectMonth={(monthKey) => setInspectMonth(monthKey)}
            />
          </GlassCard>
        );

      case 'category-distribution':
        return (
          <GlassCard key={widgetId}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Expense Distribution by Category</h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Click a slice or category row to inspect matching expenses
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace('transactions')}
                className="text-xs text-white/65 hover:text-white glass-interactive px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                View Transactions
              </button>
            </div>
            <CategoryDonutChart
              items={categoryBreakdown}
              currency={currency}
              locale={locale}
              onSelectCategory={(catId) => {
                if (onInspectCategory) onInspectCategory(catId);
                else setActiveWorkspace('transactions');
              }}
            />
          </GlassCard>
        );

      case 'budget-utilization':
        return (
          <GlassCard key={widgetId}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Budget Utilization</h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Active budgets and threshold pacing
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace('budgets')}
                className="text-xs text-white/65 hover:text-white glass-interactive px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                All Budgets
              </button>
            </div>
            {budgetStatuses.length === 0 ? (
              <p className="text-xs text-white/50 py-4">No active budgets configured.</p>
            ) : (
              <div className="space-y-4">
                {budgetStatuses.slice(0, 4).map((st) => (
                  <div key={st.budget.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-white/90 font-medium truncate">{st.budget.name}</span>
                      <span className="font-mono-num text-white/65 shrink-0">
                        <CurrencyText minor={st.spentMinor} currency={st.budget.currency} locale={locale} /> /{' '}
                        <CurrencyText minor={st.effectiveLimitMinor} currency={st.budget.currency} locale={locale} /> ({st.utilizationPct}%)
                      </span>
                    </div>
                    <UtilizationBar
                      pct={st.utilizationPct}
                      tone={
                        st.state === 'exceeded'
                          ? 'danger'
                          : st.state === 'approaching'
                          ? 'warning'
                          : 'neutral'
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        );

      case 'savings-progress':
        return (
          <GlassCard key={widgetId}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Active Savings Goals</h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Tracked separately from income via goal contributions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace('savings-goals')}
                className="text-xs text-white/65 hover:text-white glass-interactive px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                Manage Goals
              </button>
            </div>
            {goalProgressList.length === 0 ? (
              <p className="text-xs text-white/50 py-4">No savings goals created yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {goalProgressList.slice(0, 3).map((gp) => (
                  <div
                    key={gp.goal.id}
                    className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-white">{gp.goal.name}</div>
                        <div className="text-[11px] text-white/45 mt-0.5">
                          {gp.goal.categoryLabel} · Target {formatDisplayDate(gp.goal.targetDate, state.preferences.dateFormat, locale)}
                        </div>
                      </div>
                      <span className="text-xs font-mono-num text-white/80">{gp.progressPct}%</span>
                    </div>
                    <UtilizationBar pct={gp.progressPct} tone="income" />
                    <div className="flex items-center justify-between text-xs text-white/60 font-mono-num">
                      <span><CurrencyText minor={gp.savedMinor} currency={gp.goal.currency} locale={locale} /></span>
                      <span>of <CurrencyText minor={gp.goal.targetAmountMinor} currency={gp.goal.currency} locale={locale} /></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        );

      case 'upcoming-payments':
        return (
          <GlassCard key={widgetId}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Upcoming Bills &amp; Renewals</h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Scheduled obligations and upcoming subscription billing
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace('bills')}
                className="text-xs text-white/65 hover:text-white glass-interactive px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                Bills Workspace
              </button>
            </div>
            {upcomingBills.length === 0 && subIntel.upcomingRenewals.length === 0 ? (
              <p className="text-xs text-white/50 py-4">No unpaid bills or upcoming renewals in the next 30 days.</p>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {upcomingBills.slice(0, 4).map((bill) => {
                  const alertState = getBillAlertState(bill, referenceDate);
                  return (
                    <div key={bill.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{bill.name}</div>
                        <div className="text-white/50 mt-0.5">
                          Due {formatDisplayDate(bill.dueDate, state.preferences.dateFormat, locale)}
                          {' · '}
                          {bill.isEstimated ? 'Estimated' : 'Confirmed'}
                          {alertState === 'overdue' && (
                            <span className="text-red-400"> · Overdue</span>
                          )}
                          {alertState === 'due-soon' && (
                            <span className="text-amber-400"> · Due Soon</span>
                          )}
                        </div>
                      </div>
                      <CurrencyText
                        minor={bill.amountMinor}
                        currency={bill.currency}
                        locale={locale}
                        className="text-white font-medium shrink-0"
                      />
                    </div>
                  );
                })}
                {subIntel.upcomingRenewals.slice(0, 3).map((sub) => (
                  <div key={sub.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0">
                      <div className="text-white/90 font-medium truncate">{sub.name}</div>
                      <div className="text-white/50 mt-0.5">
                        Renewal {formatDisplayDate(sub.nextBillingDate, state.preferences.dateFormat, locale)} · {sub.frequency}
                      </div>
                    </div>
                    <CurrencyText
                      minor={sub.amountMinor}
                      currency={sub.currency}
                      locale={locale}
                      className="text-white/80 shrink-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        );

      case 'recent-transactions':
        return (
          <GlassCard key={widgetId}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Recent Transactions</h2>
                <p className="text-xs text-white/50 mt-0.5">Latest completed ledger entries</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace('transactions')}
                className="text-xs text-white/65 hover:text-white glass-interactive px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                View All
              </button>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-white/50 py-4">No completed transactions recorded yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {recentTransactions.map((tx) => {
                  const catName =
                    tx.type === 'transfer'
                      ? 'Internal Transfer'
                      : state.categories.find((c) => c.id === tx.categoryId)?.name ?? 'Uncategorized';
                  const accName = state.accounts.find((a) => a.id === tx.accountId)?.name ?? '';
                  return (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{tx.description}</div>
                        <div className="text-white/45 mt-0.5 truncate">
                          {formatDisplayDate(tx.date, state.preferences.dateFormat, locale)} · {catName} · {accName}
                        </div>
                      </div>
                      <CurrencyText
                        minor={
                          tx.type === 'expense' || (tx.type === 'adjustment' && tx.adjustmentDirection === 'debit')
                            ? -tx.amountMinor
                            : tx.amountMinor
                        }
                        currency={tx.currency}
                        locale={locale}
                        showPlus={tx.type === 'income' || tx.type === 'refund'}
                        className={
                          tx.type === 'income' || tx.type === 'refund'
                            ? 'text-emerald-400 font-medium shrink-0'
                            : tx.type === 'transfer'
                            ? 'text-white/75 shrink-0'
                            : 'text-white font-medium shrink-0'
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        );

      case 'quick-insights':
        return (
          <GlassCard key={widgetId}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-white/75" />
                <h2 className="text-base font-semibold text-white">Financial Insights</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveWorkspace('insights')}
                className="text-xs text-white/65 hover:text-white glass-interactive px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                All Insights
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-white">{ins.title}</span>
                    {ins.metricLabel && (
                      <span className="text-[11px] font-mono-num text-white/55 shrink-0">
                        {ins.metricLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/55 mt-1 leading-relaxed">{ins.explanation}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        );
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Financial Dashboard"
        subtitle="Real-time view of balances, cash flow, budgets, bills, and savings derived strictly from your recorded ledger."
        action={
          <>
            <button
              type="button"
              onClick={() => setCustomizeOpen(true)}
              className="glass-interactive px-3.5 py-2 rounded-xl text-xs font-medium text-white/85 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Customize
            </button>
            <button
              type="button"
              onClick={() => setTxModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Transaction
            </button>
          </>
        }
      />

      {/* Explicit Sample Data Notice */}
      {state.isSampleData && (
        <div className="glass-secondary rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border border-white/[0.14]">
          <div className="text-xs text-white/80">
            <strong className="font-semibold text-white">Sample Dataset Active</strong> — Previewing demo records. Click <strong className="text-white">Clear Sample Data</strong> to start tracking your own expenses and savings, and set your currency in Settings.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveWorkspace('settings')}
              className="glass-interactive px-3 py-1.5 rounded-xl text-xs font-medium text-white/80 hover:text-white whitespace-nowrap"
            >
              Currency &amp; Settings
            </button>
            <button
              type="button"
              onClick={clearSampleDataAndStartFresh}
              className="glass-interactive px-3 py-1.5 rounded-xl text-xs font-medium text-white/95 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Sample Data
            </button>
          </div>
        </div>
      )}

      {/* Missing FX Rate Warning if multi-currency account lacks rate */}
      {summary.missingRateCurrencies.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
          <span>
            Conversion rates are not configured for {summary.missingRateCurrencies.join(', ')} to {currency}. Those balances are excluded from converted totals rather than estimated.
          </span>
          <button
            type="button"
            onClick={() => setActiveWorkspace('settings')}
            className="underline text-amber-300 hover:text-amber-200 whitespace-nowrap"
          >
            Configure FX Rates
          </button>
        </div>
      )}

      {/* Date Range Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<DateRangePreset>
          ariaLabel="Dashboard date range"
          value={dateRange.preset}
          onChange={(preset) => setDateRangePreset(preset, customStart, customEnd)}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'this-week', label: 'This week' },
            { value: 'this-month', label: 'This month' },
            { value: 'last-month', label: 'Last month' },
            { value: 'this-year', label: 'This year' },
            { value: 'custom', label: 'Custom' },
          ]}
        />

        {dateRange.preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              aria-label="Custom start date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setDateRangePreset('custom', e.target.value, customEnd);
              }}
              className="finora-input px-2.5 py-1.5 text-xs font-mono-num"
            />
            <span className="text-white/45">to</span>
            <input
              type="date"
              aria-label="Custom end date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setDateRangePreset('custom', customStart, e.target.value);
              }}
              className="finora-input px-2.5 py-1.5 text-xs font-mono-num"
            />
          </div>
        )}
      </div>

      {state.transactions.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="w-5 h-5" />}
          title="Your Finora ledger is ready"
          description="Record your first income, expense, or account transfer—or import a CSV/XLSX bank statement—to populate your dashboard analytics."
          actionLabel="Record First Transaction"
          onAction={() => setTxModalOpen(true)}
        />
      ) : (
        <div className="space-y-5">
          {widgetOrder.map((wId) => renderWidget(wId))}
        </div>
      )}

      {/* Transaction Creation Modal */}
      <TransactionModal open={txModalOpen} onClose={() => setTxModalOpen(false)} />

      {/* Dashboard Widget Customization Modal */}
      <GlassModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize Dashboard Layout"
        subtitle="Show, hide, or reorder dashboard sections."
      >
        <div className="space-y-2">
          {widgetOrder.map((wId, idx) => {
            const isHidden = hiddenSet.has(wId);
            return (
              <div
                key={wId}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-2.5"
              >
                <span className={`text-sm ${isHidden ? 'text-white/40 line-through' : 'text-white'}`}>
                  {WIDGET_LABELS[wId]}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveWidget(wId, -1)}
                    aria-label={`Move ${WIDGET_LABELS[wId]} up`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/75 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === widgetOrder.length - 1}
                    onClick={() => moveWidget(wId, 1)}
                    aria-label={`Move ${WIDGET_LABELS[wId]} down`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/75 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWidgetVisibility(wId)}
                    aria-label={isHidden ? `Show ${WIDGET_LABELS[wId]}` : `Hide ${WIDGET_LABELS[wId]}`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/80"
                  >
                    {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </GlassModal>

      {/* Chart Month Drilldown Modal */}
      <GlassModal
        open={Boolean(inspectMonth)}
        onClose={() => setInspectMonth(null)}
        title={`Transactions in ${inspectMonth ?? ''}`}
        subtitle="Underlying ledger records contributing to this month's cash flow bar."
        maxWidthClass="max-w-2xl"
      >
        {inspectedMonthTxs.length === 0 ? (
          <p className="text-xs text-white/55">No completed transactions recorded for this month.</p>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {inspectedMonthTxs.map((tx) => (
              <div key={tx.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                <div className="min-w-0">
                  <div className="text-white font-medium truncate">{tx.description}</div>
                  <div className="text-white/45 mt-0.5">
                    {tx.date} · {tx.type} · {tx.merchant || 'No merchant'}
                  </div>
                </div>
                <CurrencyText
                  minor={tx.type === 'expense' ? -tx.amountMinor : tx.amountMinor}
                  currency={tx.currency}
                  locale={locale}
                  className="text-white font-medium shrink-0"
                />
              </div>
            ))}
          </div>
        )}
      </GlassModal>
    </div>
  );
};

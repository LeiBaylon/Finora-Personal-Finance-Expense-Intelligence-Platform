import React, { useMemo } from 'react';
import {
  computeCategoryBreakdown,
  computeMonthlyCashFlowSeries,
  computePeriodSummary,
  computeSubscriptionIntelligence,
  resolveDateRange,
} from '../../core/accounting';
import {
  computeFinancialHealthIndicators,
  detectFrequentSmallPurchases,
  detectUnusualTransactions,
  generateFinancialInsights,
} from '../../core/intelligence';
import { convertMinorUnits } from '../../core/money';
import { useLedger } from '../../context/LedgerContext';
import { CategoryDonutChart, SpendingTrendAreaChart } from '../charts/FinoraCharts';
import { CurrencyText, GlassCard, SectionHeader } from '../ui/GlassPrimitives';

export const InsightsView: React.FC = () => {
  const { state, referenceDate } = useLedger();

  const insights = useMemo(
    () => (state ? generateFinancialInsights(state, referenceDate) : []),
    [state, referenceDate]
  );
  const unusual = useMemo(
    () => (state ? detectUnusualTransactions(state, referenceDate) : []),
    [state, referenceDate]
  );
  const smallCluster = useMemo(
    () => (state ? detectFrequentSmallPurchases(state, referenceDate) : null),
    [state, referenceDate]
  );
  const indicators = useMemo(
    () => (state ? computeFinancialHealthIndicators(state, referenceDate) : []),
    [state, referenceDate]
  );

  if (!state) return null;

  const currency = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Financial Insights"
        subtitle="Automatic spending observations, unusual expense checks, and transparent savings metrics computed directly from your ledger."
      />

      {/* Core Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((ins) => {
          const borderAccent =
            ins.severity === 'alert'
              ? 'border-red-400/30'
              : ins.severity === 'warning'
              ? 'border-amber-400/25'
              : ins.severity === 'positive'
              ? 'border-emerald-400/25'
              : 'border-white/[0.09]';

          return (
            <GlassCard key={ins.id} className={`border ${borderAccent}`}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">{ins.title}</h2>
                {ins.metricLabel && (
                  <span className="text-xs font-mono-num text-white/65 shrink-0">
                    {ins.metricLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/65 mt-2 leading-relaxed">{ins.explanation}</p>
            </GlassCard>
          );
        })}
      </div>

      {/* Unusual Transactions & Frequent Small Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GlassCard>
          <h2 className="text-base font-semibold text-white mb-3">Unusual Expense Detection</h2>
          {unusual.length === 0 ? (
            <p className="text-xs text-white/50">
              No outlier expenses detected above 2.2x your category average this month.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {unusual.map((u) => (
                <div key={u.transaction.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">
                      {u.transaction.merchant || u.transaction.description}
                    </div>
                    <div className="text-white/50 mt-0.5">{u.reason}</div>
                  </div>
                  <CurrencyText
                    minor={u.transaction.amountMinor}
                    currency={u.transaction.currency}
                    locale={locale}
                    className="text-amber-300 font-semibold shrink-0"
                  />
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="text-base font-semibold text-white mb-3">Frequent Small Purchases</h2>
          {!smallCluster ? (
            <p className="text-xs text-white/50">
              No high-frequency small purchase cluster detected this month.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="text-white/65">{smallCluster.count} small purchases this month</span>
                <CurrencyText
                  minor={smallCluster.totalMinor}
                  currency={currency}
                  locale={locale}
                  className="text-lg font-semibold text-white"
                />
              </div>
              <p className="text-white/55 leading-relaxed">
                Average ticket:{' '}
                <CurrencyText minor={smallCluster.averageMinor} currency={currency} locale={locale} className="text-white" />
                {smallCluster.topMerchants.length > 0 && ` · Most frequent: ${smallCluster.topMerchants.join(', ')}`}
              </p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Key Financial Health Ratios */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-white">Key Financial Ratios</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {indicators.map((ind) => {
            const statusColor =
              ind.status === 'Healthy'
                ? 'text-emerald-400'
                : ind.status === 'Moderate'
                ? 'text-amber-300'
                : ind.status === 'Needs Attention'
                ? 'text-red-400'
                : 'text-white/50';

            return (
              <GlassCard key={ind.id} className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{ind.name}</h3>
                    <span className={`text-xs font-medium ${statusColor}`}>{ind.status}</span>
                  </div>
                  <div className="text-lg font-semibold font-mono-num text-white text-right">
                    {ind.valueDisplay}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2 text-[11px] font-mono-num text-white/75">
                  {ind.breakdown}
                </div>
                <p className="text-xs text-white/55 leading-relaxed">{ind.explanation}</p>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AnalyticsView: React.FC = () => {
  const { state, dateRange, referenceDate } = useLedger();

  const categoryBreakdown = useMemo(
    () => (state ? computeCategoryBreakdown(state, 'expense', dateRange) : []),
    [state, dateRange]
  );

  const series = useMemo(
    () => (state ? computeMonthlyCashFlowSeries(state, 6, referenceDate) : []),
    [state, referenceDate]
  );

  if (!state) return null;

  const currency = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;
  const thisMonth = resolveDateRange('this-month', referenceDate);
  const subIntel = computeSubscriptionIntelligence(state.subscriptions, currency, state.fxRates, referenceDate);
  const summary = computePeriodSummary(state, thisMonth, currency);

  // Day-of-week distribution
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const tx of state.transactions) {
    if (tx.status !== 'completed' || tx.type !== 'expense') continue;
    const conv = convertMinorUnits(tx.amountMinor, tx.currency, currency, state.fxRates);
    if (conv.convertedMinor === null) continue;
    const d = new Date(`${tx.date}T00:00:00Z`).getUTCDay();
    weekdayTotals[d] += conv.convertedMinor;
  }
  const maxWeekday = Math.max(1, ...weekdayTotals);

  const fixedSharePct =
    summary.netExpensesMinor > 0
      ? Math.min(100, Math.round((subIntel.monthlyTotalMinor / summary.netExpensesMinor) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Spending Analytics"
        subtitle="Deep behavioral breakdown across categories, weekday cadence, and recurring vs variable spending."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard>
          <div className="text-xs text-white/55">Active Period Net Spend</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            <CurrencyText minor={summary.netExpensesMinor} currency={currency} locale={locale} />
          </div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs text-white/55">Subscription Fixed Share</div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-white">
            {fixedSharePct}%
          </div>
          <div className="mt-1 text-xs text-white/45">Of monthly net expenses</div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs text-white/55">Top Spending Category</div>
          <div className="mt-2 text-xl font-semibold text-white truncate">
            {categoryBreakdown[0]?.categoryName ?? 'None'}
          </div>
          <div className="mt-1 text-xs text-white/45">
            {categoryBreakdown[0] ? `${categoryBreakdown[0].percentage}% of period spend` : 'No expenses recorded'}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GlassCard>
          <h2 className="text-base font-semibold text-white mb-4">Category Share</h2>
          <CategoryDonutChart items={categoryBreakdown} currency={currency} locale={locale} />
        </GlassCard>

        <GlassCard>
          <h2 className="text-base font-semibold text-white mb-4">Monthly Expense Velocity</h2>
          <SpendingTrendAreaChart
            points={series.map((s) => ({ label: s.label, valueMinor: s.expensesMinor }))}
            currency={currency}
            locale={locale}
            strokeColor="#f87171"
          />
        </GlassCard>
      </div>

      <GlassCard>
        <h2 className="text-base font-semibold text-white mb-4">Cumulative Spending by Day of Week</h2>
        <div className="grid grid-cols-7 gap-3 items-end h-40 pt-4">
          {weekdayNames.map((day, idx) => {
            const val = weekdayTotals[idx];
            const hPct = Math.max(4, Math.round((val / maxWeekday) * 100));
            return (
              <div key={day} className="flex flex-col items-center justify-end h-full gap-2">
                <div className="text-[11px] font-mono-num text-white/60">
                  <CurrencyText minor={val} currency={currency} locale={locale} compact />
                </div>
                <div className="w-full max-w-[42px] flex-1 flex items-end">
                  <div
                    style={{ height: `${hPct}%` }}
                    className="w-full rounded-lg bg-white/80 transition-all"
                  />
                </div>
                <span className="text-xs text-white/55">{day}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
};

export const FinancialHealthView: React.FC = () => {
  const { state, referenceDate } = useLedger();

  const indicators = useMemo(
    () => (state ? computeFinancialHealthIndicators(state, referenceDate) : []),
    [state, referenceDate]
  );

  if (!state) return null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Financial Health"
        subtitle="Six transparent indicators computed directly from your ledger. Every indicator shows its exact mathematical formula and underlying figures rather than an arbitrary score."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {indicators.map((ind) => {
          const statusColor =
            ind.status === 'Healthy'
              ? 'text-emerald-400'
              : ind.status === 'Moderate'
              ? 'text-amber-300'
              : ind.status === 'Needs Attention'
              ? 'text-red-400'
              : 'text-white/50';

          return (
            <GlassCard key={ind.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">{ind.name}</h2>
                  <span className={`text-xs font-medium ${statusColor}`}>{ind.status}</span>
                </div>
                <div className="text-xl font-semibold font-mono-num text-white text-right">
                  {ind.valueDisplay}
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3 text-xs space-y-1">
                <div className="text-white/45">Formula: <span className="text-white/80">{ind.formula}</span></div>
                <div className="text-white/45 font-mono-num">Calculation: <span className="text-white/85">{ind.breakdown}</span></div>
              </div>

              <p className="text-xs text-white/60 leading-relaxed">{ind.explanation}</p>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};

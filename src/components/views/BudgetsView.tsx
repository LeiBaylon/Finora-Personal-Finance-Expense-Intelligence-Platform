import React, { useMemo, useState } from 'react';
import { AlertTriangle, Edit3, Plus, Trash2 } from 'lucide-react';
import { computeBudgetStatus, resolveDateRange } from '../../core/accounting';
import { CURRENCY_LIST, fromMinorUnits, toMinorUnits } from '../../core/money';
import type { Budget, BudgetPeriod, CurrencyCode } from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import { UtilizationBar } from '../charts/FinoraCharts';
import {
  ConfirmDialog,
  CurrencyText,
  EmptyState,
  GlassCard,
  GlassModal,
  SectionHeader,
} from '../ui/GlassPrimitives';

export const BudgetsView: React.FC = () => {
  const { state, referenceDate, addBudget, updateBudget, deleteBudget } = useLedger();

  const [selectedPlan, setSelectedPlan] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [planName, setPlanName] = useState('Core Living Plan');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [carryOver, setCarryOver] = useState(false);
  const [carryOverInput, setCarryOverInput] = useState('0');
  const [thresholdPct, setThresholdPct] = useState('80');

  const budgetStatuses = useMemo(() => {
    if (!state) return [];
    return state.budgets
      .filter((b) => selectedPlan === 'all' || b.planName === selectedPlan)
      .map((b) => computeBudgetStatus(b, state.transactions, state.fxRates, referenceDate));
  }, [state, selectedPlan, referenceDate]);

  if (!state) return null;

  const plans = Array.from(new Set(state.budgets.map((b) => b.planName).filter(Boolean)));
  const locale = state.preferences.locale;

  const openCreate = () => {
    const monthRange = resolveDateRange('this-month', referenceDate);
    setEditingBudget(null);
    setName('');
    setPlanName(selectedPlan !== 'all' ? selectedPlan : 'Core Living Plan');
    setPeriod('monthly');
    setStartDate(monthRange.startDate);
    setEndDate(monthRange.endDate);
    setCategoryId('');
    setAmountInput('');
    setCurrency(state.preferences.primaryCurrency);
    setCarryOver(false);
    setCarryOverInput('0');
    setThresholdPct(String(state.preferences.defaultBudgetAlertThresholdPct));
    setModalOpen(true);
  };

  const openEdit = (b: Budget) => {
    setEditingBudget(b);
    setName(b.name);
    setPlanName(b.planName);
    setPeriod(b.period);
    setStartDate(b.startDate);
    setEndDate(b.endDate);
    setCategoryId(b.categoryId ?? '');
    setAmountInput(String(fromMinorUnits(b.amountMinor, b.currency)));
    setCurrency(b.currency);
    setCarryOver(b.carryOver);
    setCarryOverInput(String(fromMinorUnits(b.previousCarryOverMinor, b.currency)));
    setThresholdPct(String(b.alertThresholdPct));
    setModalOpen(true);
  };

  const handlePeriodChange = (p: BudgetPeriod) => {
    setPeriod(p);
    if (p === 'monthly') {
      const r = resolveDateRange('this-month', referenceDate);
      setStartDate(r.startDate);
      setEndDate(r.endDate);
    } else if (p === 'weekly') {
      const r = resolveDateRange('this-week', referenceDate);
      setStartDate(r.startDate);
      setEndDate(r.endDate);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = toMinorUnits(amountInput, currency);
    if (!name.trim() || amountMinor <= 0) return;

    const payload: Omit<Budget, 'id'> = {
      name: name.trim(),
      planName: planName.trim() || 'Core Living Plan',
      period,
      startDate,
      endDate,
      categoryId: categoryId || null,
      amountMinor,
      currency,
      carryOver,
      previousCarryOverMinor: carryOver ? toMinorUnits(carryOverInput, currency) : 0,
      alertThresholdPct: Math.min(100, Math.max(10, Number(thresholdPct) || 80)),
      active: true,
    };

    if (editingBudget) {
      updateBudget(editingBudget.id, payload);
    } else {
      addBudget(payload);
    }
    setModalOpen(false);
  };

  const applyTemplate = (template: 'essentials' | 'weekly-food') => {
    const monthRange = resolveDateRange('this-month', referenceDate);
    const weekRange = resolveDateRange('this-week', referenceDate);
    const curr = state.preferences.primaryCurrency;

    if (template === 'essentials') {
      addBudget({
        name: 'Housing & Utilities Cap',
        planName: 'Essentials Template',
        period: 'monthly',
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
        categoryId: 'cat-housing',
        amountMinor: toMinorUnits(2500, curr),
        currency: curr,
        carryOver: false,
        previousCarryOverMinor: 0,
        alertThresholdPct: 85,
        active: true,
      });
    } else {
      addBudget({
        name: 'Weekly Groceries & Dining',
        planName: 'Weekly Discipline',
        period: 'weekly',
        startDate: weekRange.startDate,
        endDate: weekRange.endDate,
        categoryId: 'cat-groceries',
        amountMinor: toMinorUnits(180, curr),
        currency: curr,
        carryOver: true,
        previousCarryOverMinor: 0,
        alertThresholdPct: 80,
        active: true,
      });
    }
  };

  const activeAlerts = budgetStatuses.filter((s) => s.state !== 'on-track');

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Budgets"
        subtitle="Configure weekly, monthly, or custom-period budgets with carry-over rules, alert thresholds, and pace projections."
        action={
          <>
            <button
              type="button"
              onClick={() => applyTemplate('weekly-food')}
              className="glass-interactive px-3.5 py-2 rounded-xl text-xs font-medium text-white/85 whitespace-nowrap"
            >
              + Weekly Grocery Template
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Budget
            </button>
          </>
        }
      />

      {/* Plan selector */}
      {plans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedPlan('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              selectedPlan === 'all' ? 'bg-white text-black' : 'glass-interactive text-white/70'
            }`}
          >
            All Plans ({state.budgets.length})
          </button>
          {plans.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelectedPlan(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                selectedPlan === p ? 'bg-white text-black' : 'glass-interactive text-white/70'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Active Budget Alerts */}
      {activeAlerts.length > 0 && (
        <GlassCard className="space-y-2.5 border border-amber-400/25">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            Budget Threshold Alerts ({activeAlerts.length})
          </div>
          <div className="space-y-1.5">
            {activeAlerts.map((st) => (
              <div key={st.budget.id} className="text-xs text-white/80 flex flex-wrap justify-between gap-2">
                <span>
                  <strong className="text-white">{st.budget.name}</strong> is at{' '}
                  <span className={st.state === 'exceeded' ? 'text-red-400 font-semibold' : 'text-amber-300 font-semibold'}>
                    {st.utilizationPct}%
                  </span>{' '}
                  (alert threshold {st.budget.alertThresholdPct}%).
                </span>
                <span className="font-mono-num text-white/60">
                  Projected end-of-period:{' '}
                  <CurrencyText minor={st.projectedSpendMinor} currency={st.budget.currency} locale={locale} />
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {budgetStatuses.length === 0 ? (
        <EmptyState
          title="No budgets configured"
          description="Create an overall spending budget or category-specific limit to track utilization and pacing."
          actionLabel="Create First Budget"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgetStatuses.map((st) => {
            const b = st.budget;
            const catName = b.categoryId
              ? state.categories.find((c) => c.id === b.categoryId)?.name ?? 'Category'
              : 'All Expenses';
            const tone =
              st.state === 'exceeded'
                ? 'danger'
                : st.state === 'approaching'
                ? 'warning'
                : 'neutral';

            return (
              <GlassCard key={b.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">{b.name}</h3>
                    <div className="text-xs text-white/50 mt-0.5">
                      {b.planName} · {catName} · {b.startDate} to {b.endDate}
                      {b.carryOver ? ' · Carry-over enabled' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      aria-label={`Edit ${b.name}`}
                      className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/70 hover:text-white"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(b)}
                      aria-label={`Delete ${b.name}`}
                      className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-red-400/80 hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="text-xl font-semibold text-white">
                      <CurrencyText minor={st.spentMinor} currency={b.currency} locale={locale} />
                      <span className="text-xs font-normal text-white/50">
                        {' '}
                        of <CurrencyText minor={st.effectiveLimitMinor} currency={b.currency} locale={locale} />
                      </span>
                    </div>
                    <span
                      className={`text-xs font-mono-num font-semibold ${
                        st.state === 'exceeded'
                          ? 'text-red-400'
                          : st.state === 'approaching'
                          ? 'text-amber-300'
                          : 'text-white/80'
                      }`}
                    >
                      {st.utilizationPct}%
                    </span>
                  </div>
                  <UtilizationBar pct={st.utilizationPct} tone={tone} />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.08] text-xs">
                  <div>
                    <div className="text-white/45">Remaining</div>
                    <div className={`font-mono-num font-medium mt-0.5 ${st.remainingMinor < 0 ? 'text-red-400' : 'text-white'}`}>
                      <CurrencyText minor={st.remainingMinor} currency={b.currency} locale={locale} />
                    </div>
                  </div>
                  <div>
                    <div className="text-white/45">Projected</div>
                    <div className="font-mono-num font-medium text-white mt-0.5">
                      <CurrencyText minor={st.projectedSpendMinor} currency={b.currency} locale={locale} />
                    </div>
                  </div>
                  <div>
                    <div className="text-white/45">Alert At</div>
                    <div className="font-mono-num font-medium text-white mt-0.5">
                      {b.alertThresholdPct}%
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <GlassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBudget ? `Edit ${editingBudget.name}` : 'Create Budget'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="bud-name" className="block text-xs text-white/65 mb-1">
                Budget Name
              </label>
              <input
                id="bud-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Monthly Groceries"
                className="w-full finora-input px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="bud-plan" className="block text-xs text-white/65 mb-1">
                Budget Plan Name
              </label>
              <input
                id="bud-plan"
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="bud-cat" className="block text-xs text-white/65 mb-1">
                Scope / Category
              </label>
              <select
                id="bud-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                <option value="">Overall Spending (All Expense Categories)</option>
                {state.categories
                  .filter((c) => !c.archived && c.kind === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="bud-amt" className="block text-xs text-white/65 mb-1">
                Budget Limit
              </label>
              <input
                id="bud-amt"
                type="number"
                step="any"
                min="1"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>

            <div>
              <label htmlFor="bud-curr" className="block text-xs text-white/65 mb-1">
                Currency
              </label>
              <select
                id="bud-curr"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                {CURRENCY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="bud-period" className="block text-xs text-white/65 mb-1">
                Period
              </label>
              <select
                id="bud-period"
                value={period}
                onChange={(e) => handlePeriodChange(e.target.value as BudgetPeriod)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="custom">Custom Period</option>
              </select>
            </div>

            <div>
              <label htmlFor="bud-thresh" className="block text-xs text-white/65 mb-1">
                Alert Threshold (%)
              </label>
              <input
                id="bud-thresh"
                type="number"
                min="10"
                max="100"
                value={thresholdPct}
                onChange={(e) => setThresholdPct(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>

            <div>
              <label htmlFor="bud-start" className="block text-xs text-white/65 mb-1">
                Start Date
              </label>
              <input
                id="bud-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>

            <div>
              <label htmlFor="bud-end" className="block text-xs text-white/65 mb-1">
                End Date
              </label>
              <input
                id="bud-end"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={carryOver}
                onChange={(e) => setCarryOver(e.target.checked)}
              />
              Enable carry-over balance from previous period
            </label>
            {carryOver && (
              <div>
                <label htmlFor="bud-carry" className="block text-xs text-white/65 mb-1">
                  Carried-over Amount ({currency})
                </label>
                <input
                  id="bud-carry"
                  type="number"
                  step="any"
                  value={carryOverInput}
                  onChange={(e) => setCarryOverInput(e.target.value)}
                  className="w-full finora-input px-3 py-2 text-sm font-mono-num"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90"
            >
              Save Budget
            </button>
          </div>
        </form>
      </GlassModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteBudget(deleteTarget.id);
        }}
        title="Delete Budget"
        message={`Remove budget "${deleteTarget?.name ?? ''}"? Transactions remain untouched.`}
        confirmLabel="Delete Budget"
      />
    </div>
  );
};

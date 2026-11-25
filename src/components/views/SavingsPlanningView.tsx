import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Plus, Trash2 } from 'lucide-react';
import {
  computeAllAccountBalances,
  computeMonthlyCashFlowSeries,
  computeRecurringSummary,
  computeSavingsGoalProgress,
  computeSubscriptionIntelligence,
} from '../../core/accounting';
import { CURRENCY_LIST, formatDisplayDate, formatMoney, toMinorUnits } from '../../core/money';
import type { ContributionSchedule, CurrencyCode, SavingsGoal } from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import { SpendingTrendAreaChart, UtilizationBar } from '../charts/FinoraCharts';
import {
  ConfirmDialog,
  CurrencyText,
  EmptyState,
  GlassCard,
  GlassModal,
  SectionHeader,
} from '../ui/GlassPrimitives';

const GOAL_PRESETS = [
  'Emergency Fund',
  'New Computer',
  'Travel',
  'Education',
  'Vehicle',
  'Home',
  'Custom',
];

export const SavingsGoalsView: React.FC = () => {
  const {
    state,
    referenceDate,
    addSavingsGoal,
    deleteSavingsGoal,
    recordGoalEntry,
  } = useLedger();

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [entryModal, setEntryModal] = useState<{ goal: SavingsGoal; kind: 'contribution' | 'withdrawal' } | null>(null);
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavingsGoal | null>(null);

  // Create Goal form
  const [name, setName] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('Emergency Fund');
  const [targetInput, setTargetInput] = useState('');
  const [targetDate, setTargetDate] = useState('2027-09-01');
  const [schedule, setSchedule] = useState<ContributionSchedule>('monthly');
  const [plannedInput, setPlannedInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [notes, setNotes] = useState('');

  // Contribution / Withdrawal form
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState(referenceDate);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [createTransfer, setCreateTransfer] = useState(true);

  const progressList = useMemo(
    () =>
      state
        ? state.savingsGoals.map((g) =>
            computeSavingsGoalProgress(g, state.goalTransactions, state.fxRates, referenceDate)
          )
        : [],
    [state, referenceDate]
  );

  if (!state) return null;

  const activeAccounts = state.accounts.filter((a) => !a.archived);
  const locale = state.preferences.locale;

  const openCreateGoal = () => {
    const savingsAcc = activeAccounts.find((a) => a.type === 'savings') ?? activeAccounts[0];
    setName('');
    setCategoryLabel('Emergency Fund');
    setTargetInput('');
    setTargetDate('2027-09-01');
    setSchedule('monthly');
    setPlannedInput('');
    setAccountId(savingsAcc?.id ?? '');
    setCurrency(savingsAcc?.currency ?? state.preferences.primaryCurrency);
    setNotes('');
    setGoalModalOpen(true);
  };

  const openEntryModal = (goal: SavingsGoal, kind: 'contribution' | 'withdrawal') => {
    const checkingAcc = activeAccounts.find((a) => a.id !== goal.accountId) ?? activeAccounts[0];
    setEntryModal({ goal, kind });
    setEntryAmount('');
    setEntryDate(referenceDate);
    setSourceAccountId(checkingAcc?.id ?? goal.accountId);
    setEntryNote('');
    setCreateTransfer(checkingAcc?.id !== goal.accountId);
  };

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMinor = toMinorUnits(targetInput, currency);
    if (!name.trim() || targetMinor <= 0 || !accountId) return;
    addSavingsGoal({
      name: name.trim(),
      categoryLabel,
      targetAmountMinor: targetMinor,
      targetDate,
      contributionSchedule: schedule,
      plannedContributionMinor: toMinorUnits(plannedInput || '0', currency),
      accountId,
      currency,
      notes: notes.trim(),
    });
    setGoalModalOpen(false);
  };

  const handleRecordEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryModal) return;
    const amt = toMinorUnits(entryAmount, entryModal.goal.currency);
    if (amt <= 0) return;
    recordGoalEntry({
      goalId: entryModal.goal.id,
      kind: entryModal.kind,
      amountMinor: amt,
      date: entryDate,
      sourceAccountId,
      note: entryNote.trim(),
      createAccountTransfer: createTransfer,
    });
    setEntryModal(null);
  };

  const historyEntries = historyGoal
    ? state.goalTransactions
        .filter((gt) => gt.goalId === historyGoal.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Savings Goals"
        subtitle="Track targets, record contributions or withdrawals via internal account transfers, and estimate completion dates without inflating income."
        action={
          <button
            type="button"
            onClick={openCreateGoal}
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Savings Goal
          </button>
        }
      />

      {progressList.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="w-5 h-5" />}
          title="No savings goals yet"
          description="Create goals for your emergency fund, equipment, travel, education, or home down payment."
          actionLabel="Create Savings Goal"
          onAction={openCreateGoal}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {progressList.map((gp) => {
            const g = gp.goal;
            const destAcc = state.accounts.find((a) => a.id === g.accountId)?.name ?? 'Account';

            return (
              <GlassCard key={g.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">{g.name}</h3>
                    <div className="text-xs text-white/50 mt-0.5">
                      {g.categoryLabel} · Stored in {destAcc} · Target{' '}
                      {formatDisplayDate(g.targetDate, state.preferences.dateFormat, locale)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(g)}
                    aria-label={`Delete ${g.name}`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-red-400/80 hover:text-red-300 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="text-xl font-semibold text-white">
                      <CurrencyText minor={gp.savedMinor} currency={g.currency} locale={locale} />
                      <span className="text-xs font-normal text-white/50">
                        {' '}
                        of <CurrencyText minor={g.targetAmountMinor} currency={g.currency} locale={locale} />
                      </span>
                    </div>
                    <span className="text-xs font-mono-num text-emerald-400 font-semibold">
                      {gp.progressPct}%
                    </span>
                  </div>
                  <UtilizationBar pct={gp.progressPct} tone="income" />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.08] text-xs">
                  <div>
                    <div className="text-white/45">Remaining</div>
                    <div className="font-mono-num text-white mt-0.5">
                      <CurrencyText minor={gp.remainingMinor} currency={g.currency} locale={locale} />
                    </div>
                  </div>
                  <div>
                    <div className="text-white/45">Required / mo</div>
                    <div className="font-mono-num text-white mt-0.5">
                      <CurrencyText minor={gp.requiredMonthlyMinor} currency={g.currency} locale={locale} />
                    </div>
                  </div>
                  <div>
                    <div className="text-white/45">Est. Completion</div>
                    <div className="font-mono-num text-white mt-0.5">
                      {gp.estimatedCompletionDate
                        ? formatDisplayDate(gp.estimatedCompletionDate, state.preferences.dateFormat, locale)
                        : 'Needs deposits'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setHistoryGoal(g)}
                    className="text-xs text-white/65 hover:text-white underline"
                  >
                    {gp.entryCount} entries in history
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEntryModal(g, 'withdrawal')}
                      className="glass-interactive px-3 py-1.5 rounded-xl text-xs text-white/80 inline-flex items-center gap-1"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Withdraw
                    </button>
                    <button
                      type="button"
                      onClick={() => openEntryModal(g, 'contribution')}
                      className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      Add Contribution
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Create Goal Modal */}
      <GlassModal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title="Create Savings Goal"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreateGoal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="goal-name" className="block text-xs text-white/65 mb-1">
                Goal Name
              </label>
              <input
                id="goal-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 6-Month Emergency Reserve"
                className="w-full finora-input px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="goal-cat" className="block text-xs text-white/65 mb-1">
                Goal Category
              </label>
              <select
                id="goal-cat"
                value={categoryLabel}
                onChange={(e) => setCategoryLabel(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                {GOAL_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="goal-acc" className="block text-xs text-white/65 mb-1">
                Destination Account
              </label>
              <select
                id="goal-acc"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  const a = activeAccounts.find((x) => x.id === e.target.value);
                  if (a) setCurrency(a.currency);
                }}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="goal-target" className="block text-xs text-white/65 mb-1">
                Target Amount ({currency})
              </label>
              <input
                id="goal-target"
                type="number"
                step="any"
                min="1"
                required
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>

            <div>
              <label htmlFor="goal-date" className="block text-xs text-white/65 mb-1">
                Target Date
              </label>
              <input
                id="goal-date"
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>

            <div>
              <label htmlFor="goal-sched" className="block text-xs text-white/65 mb-1">
                Contribution Schedule
              </label>
              <select
                id="goal-sched"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as ContributionSchedule)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>

            <div>
              <label htmlFor="goal-planned" className="block text-xs text-white/65 mb-1">
                Planned Contribution ({currency})
              </label>
              <input
                id="goal-planned"
                type="number"
                step="any"
                value={plannedInput}
                onChange={(e) => setPlannedInput(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setGoalModalOpen(false)}
              className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90"
            >
              Create Goal
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Contribution / Withdrawal Modal */}
      <GlassModal
        open={Boolean(entryModal)}
        onClose={() => setEntryModal(null)}
        title={
          entryModal?.kind === 'contribution'
            ? `Add Contribution — ${entryModal.goal.name}`
            : `Record Withdrawal — ${entryModal?.goal.name ?? ''}`
        }
        subtitle="Internal transfers never count as new income or expenses."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleRecordEntry} className="space-y-4">
          <div>
            <label htmlFor="entry-amt" className="block text-xs text-white/65 mb-1">
              Amount ({entryModal?.goal.currency})
            </label>
            <input
              id="entry-amt"
              type="number"
              step="any"
              min="0.01"
              required
              value={entryAmount}
              onChange={(e) => setEntryAmount(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>
          <div>
            <label htmlFor="entry-date" className="block text-xs text-white/65 mb-1">
              Date
            </label>
            <input
              id="entry-date"
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>
          <div>
            <label htmlFor="entry-acc" className="block text-xs text-white/65 mb-1">
              {entryModal?.kind === 'contribution' ? 'Source Account' : 'Destination Account'}
            </label>
            <select
              id="entry-acc"
              value={sourceAccountId}
              onChange={(e) => setSourceAccountId(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm"
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={createTransfer}
              onChange={(e) => setCreateTransfer(e.target.checked)}
            />
            Record corresponding internal account transfer
          </label>
          <div>
            <label htmlFor="entry-note" className="block text-xs text-white/65 mb-1">
              Note
            </label>
            <input
              id="entry-note"
              type="text"
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEntryModal(null)}
              className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90"
            >
              Confirm
            </button>
          </div>
        </form>
      </GlassModal>

      {/* History Modal */}
      <GlassModal
        open={Boolean(historyGoal)}
        onClose={() => setHistoryGoal(null)}
        title={`Contribution History — ${historyGoal?.name ?? ''}`}
        maxWidthClass="max-w-lg"
      >
        {historyEntries.length === 0 ? (
          <p className="text-xs text-white/55">No contributions or withdrawals recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {historyEntries.map((gt) => (
              <div key={gt.id} className="py-2.5 flex items-center justify-between text-xs gap-4">
                <div>
                  <div className="text-white font-medium capitalize">{gt.kind}</div>
                  <div className="text-white/45 mt-0.5">
                    {formatDisplayDate(gt.date, state.preferences.dateFormat, locale)}
                    {gt.note ? ` · ${gt.note}` : ''}
                  </div>
                </div>
                <CurrencyText
                  minor={gt.kind === 'contribution' ? gt.amountMinor : -gt.amountMinor}
                  currency={gt.currency}
                  locale={locale}
                  showPlus
                  className={gt.kind === 'contribution' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}
                />
              </div>
            ))}
          </div>
        )}
      </GlassModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteSavingsGoal(deleteTarget.id);
        }}
        title="Delete Savings Goal"
        message={`Delete "${deleteTarget?.name ?? ''}"? Account balances and historical transfers remain intact.`}
        confirmLabel="Delete Goal"
      />
    </div>
  );
};

export const FinancialPlanningView: React.FC = () => {
  const { state, referenceDate } = useLedger();
  const [extraSavingsInput, setExtraSavingsInput] = useState('300');
  const [extraExpenseInput, setExtraExpenseInput] = useState('0');

  const series = useMemo(
    () => (state ? computeMonthlyCashFlowSeries(state, 3, referenceDate) : []),
    [state, referenceDate]
  );

  if (!state) return null;

  const currency = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;
  const balances = computeAllAccountBalances(state.accounts, state.transactions, state.fxRates);
  const liquidStartMinor = state.accounts
    .filter((a) => !a.archived && a.includeInTotal)
    .reduce((s, a) => s + (balances[a.id] ?? 0), 0);

  const recurring = computeRecurringSummary(state.recurringRules, currency, state.fxRates);
  const subs = computeSubscriptionIntelligence(state.subscriptions, currency, state.fxRates, referenceDate);

  const activeMonths = series.filter((m) => m.incomeMinor > 0 || m.expensesMinor > 0);
  const avgIncomeMinor =
    activeMonths.length > 0
      ? Math.round(activeMonths.reduce((s, m) => s + m.incomeMinor, 0) / activeMonths.length)
      : recurring.monthlyIncomeMinor;
  const avgExpenseMinor =
    activeMonths.length > 0
      ? Math.round(activeMonths.reduce((s, m) => s + m.expensesMinor, 0) / activeMonths.length)
      : recurring.monthlyExpensesMinor + subs.monthlyTotalMinor;

  const plannedSavingsMinor = toMinorUnits(extraSavingsInput || '0', currency);
  const extraExpenseMinor = toMinorUnits(extraExpenseInput || '0', currency);

  const projectedMonthlyNetMinor = avgIncomeMinor - (avgExpenseMinor + extraExpenseMinor);
  const sustainableAfterSavingsMinor = projectedMonthlyNetMinor - plannedSavingsMinor;

  // 6-month projection points
  const [y, m] = referenceDate.split('-').map(Number);
  const projectionPoints = Array.from({ length: 6 }, (_, idx) => {
    const dt = new Date(Date.UTC(y, m + idx, 1));
    const label = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(dt);
    return {
      label,
      valueMinor: Math.max(0, liquidStartMinor + projectedMonthlyNetMinor * (idx + 1)),
    };
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Financial Planning"
        subtitle="Model 6-month cash flow projections and test savings affordability based strictly on your recorded income and expense averages."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <GlassCard className="space-y-4">
          <h2 className="text-base font-semibold text-white">Scenario Inputs</h2>
          <div>
            <label htmlFor="plan-sav" className="block text-xs text-white/65 mb-1">
              Planned Monthly Savings Target ({currency})
            </label>
            <input
              id="plan-sav"
              type="number"
              min="0"
              step="any"
              value={extraSavingsInput}
              onChange={(e) => setExtraSavingsInput(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>
          <div>
            <label htmlFor="plan-exp" className="block text-xs text-white/65 mb-1">
              Additional Monthly Obligation ({currency})
            </label>
            <input
              id="plan-exp"
              type="number"
              min="0"
              step="any"
              value={extraExpenseInput}
              onChange={(e) => setExtraExpenseInput(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>

          <div className="pt-3 border-t border-white/[0.08] space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-white/55">3-Mo Avg Income</span>
              <CurrencyText minor={avgIncomeMinor} currency={currency} locale={locale} className="text-emerald-400" />
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">3-Mo Avg Expenses</span>
              <CurrencyText minor={avgExpenseMinor} currency={currency} locale={locale} className="text-red-400" />
            </div>
            <div className="flex justify-between font-medium pt-1 border-t border-white/[0.06]">
              <span className="text-white">Remaining Buffer After Plan</span>
              <CurrencyText
                minor={sustainableAfterSavingsMinor}
                currency={currency}
                locale={locale}
                showPlus
                className={sustainableAfterSavingsMinor >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
            </div>
          </div>

          <p className="text-xs text-white/50 leading-relaxed">
            {sustainableAfterSavingsMinor >= 0
              ? `Based on your recorded 3-month average, allocating ${formatMoney(
                  plannedSavingsMinor,
                  currency,
                  locale
                )}/mo leaves a positive buffer of ${formatMoney(
                  sustainableAfterSavingsMinor,
                  currency,
                  locale
                )}/mo.`
              : `This allocation exceeds your recorded monthly surplus by ${formatMoney(
                  Math.abs(sustainableAfterSavingsMinor),
                  currency,
                  locale
                )}/mo.`}
          </p>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <h2 className="text-base font-semibold text-white mb-2">6-Month Projected Liquid Balance</h2>
          <p className="text-xs text-white/50 mb-4">
            Starting from current net balance of{' '}
            <CurrencyText minor={liquidStartMinor} currency={currency} locale={locale} className="text-white" />{' '}
            at projected monthly net flow of{' '}
            <CurrencyText minor={projectedMonthlyNetMinor} currency={currency} locale={locale} showPlus className="text-white" />
            /mo.
          </p>
          <SpendingTrendAreaChart points={projectionPoints} currency={currency} locale={locale} />
        </GlassCard>
      </div>
    </div>
  );
};

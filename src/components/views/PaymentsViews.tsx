import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Pause,
  Play,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import {
  computeNextOccurrenceDate,
  computeRecurringSummary,
  computeSubscriptionIntelligence,
  getBillAlertState,
  normalizeToAnnualMinor,
} from '../../core/accounting';
import { CURRENCY_LIST, convertMinorUnits, formatDisplayDate, fromMinorUnits, toMinorUnits } from '../../core/money';
import type {
  Bill,
  BillCategoryType,
  CurrencyCode,
  RecurrenceFrequency,
  RecurringRule,
  Subscription,
} from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import {
  ConfirmDialog,
  CurrencyText,
  EmptyState,
  GlassCard,
  GlassModal,
  SectionHeader,
  SegmentedControl,
} from '../ui/GlassPrimitives';

const BILL_TYPES: Array<{ value: BillCategoryType; label: string }> = [
  { value: 'utility', label: 'Utility' },
  { value: 'rent', label: 'Rent' },
  { value: 'internet', label: 'Internet' },
  { value: 'phone', label: 'Phone' },
  { value: 'loan', label: 'Loan' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'membership', label: 'Membership' },
  { value: 'other', label: 'Other' },
];

export const BillsView: React.FC = () => {
  const { state, referenceDate, addBill, deleteBill, markBillPaid } = useLedger();

  const [createOpen, setCreateOpen] = useState(false);
  const [payBill, setPayBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);

  const [name, setName] = useState('');
  const [billType, setBillType] = useState<BillCategoryType>('utility');
  const [amountInput, setAmountInput] = useState('');
  const [isEstimated, setIsEstimated] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [dueDate, setDueDate] = useState(referenceDate);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [reminderDays, setReminderDays] = useState('5');
  const [notes, setNotes] = useState('');

  // Pay modal
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payDateInput, setPayDateInput] = useState(referenceDate);

  if (!state) return null;

  const activeAccounts = state.accounts.filter((a) => !a.archived);
  const primary = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;

  const expectedMonthlyMinor = state.bills.reduce((sum, b) => {
    const conv = convertMinorUnits(b.amountMinor, b.currency, primary, state.fxRates);
    return sum + (conv.convertedMinor ?? 0);
  }, 0);

  const unpaidBills = state.bills.filter((b) => b.status === 'unpaid');
  const overdueBills = unpaidBills.filter((b) => getBillAlertState(b, referenceDate) === 'overdue');

  const openCreate = () => {
    setName('');
    setBillType('utility');
    setAmountInput('');
    setIsEstimated(false);
    setCurrency(primary);
    setDueDate(referenceDate);
    setFrequency('monthly');
    setAccountId(activeAccounts[0]?.id ?? '');
    setCategoryId('cat-utilities');
    setReminderDays('5');
    setNotes('');
    setCreateOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = toMinorUnits(amountInput, currency);
    if (!name.trim() || amt <= 0 || !accountId) return;
    addBill({
      name: name.trim(),
      billType,
      amountMinor: amt,
      isEstimated,
      currency,
      dueDate,
      frequency,
      accountId,
      categoryId: categoryId || null,
      status: 'unpaid',
      reminderDaysBefore: Math.max(0, Number(reminderDays) || 3),
      notes: notes.trim(),
    });
    setCreateOpen(false);
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payBill) return;
    const paidMinor = toMinorUnits(payAmountInput, payBill.currency);
    if (paidMinor <= 0) return;
    markBillPaid(payBill.id, paidMinor, payDateInput);
    setPayBill(null);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Bills & Payments"
        subtitle="Monitor upcoming obligations, distinguish estimated bills from confirmed payments, and record real bill settlements."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Bill
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard variant="primary">
          <div className="text-xs text-white/55">Expected Monthly Obligations</div>
          <div className="mt-2.5 text-3xl font-semibold text-white">
            <CurrencyText minor={expectedMonthlyMinor} currency={primary} locale={locale} />
          </div>
          <div className="mt-1.5 text-xs text-white/45">{state.bills.length} tracked obligations</div>
        </GlassCard>

        <GlassCard>
          <div className="text-xs text-white/55">Unpaid Obligations</div>
          <div className="mt-2.5 text-2xl font-semibold text-white font-mono-num">
            {unpaidBills.length}
          </div>
          <div className="mt-1.5 text-xs text-white/45">Awaiting recorded payment</div>
        </GlassCard>

        <GlassCard>
          <div className="text-xs text-white/55">Overdue Alerts</div>
          <div className={`mt-2.5 text-2xl font-semibold font-mono-num ${overdueBills.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {overdueBills.length}
          </div>
          <div className="mt-1.5 text-xs text-white/45">
            {overdueBills.length > 0 ? 'Past due date without recorded payment' : 'All bills current'}
          </div>
        </GlassCard>
      </div>

      {overdueBills.length > 0 && (
        <div className="rounded-2xl bg-red-500/10 border border-red-400/30 px-4 py-3 flex items-center gap-2.5 text-xs text-red-200">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>
            Overdue notice: {overdueBills.map((b) => `${b.name} (due ${b.dueDate})`).join(', ')}.
          </span>
        </div>
      )}

      {state.bills.length === 0 ? (
        <EmptyState
          title="No bills tracked"
          description="Add rent, utilities, internet, phone, insurance, or loan obligations to receive due reminders."
          actionLabel="Add First Bill"
          onAction={openCreate}
        />
      ) : (
        <GlassCard variant="table" className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-white/50">
                  <th className="py-3 pl-5 pr-3 font-medium">Obligation</th>
                  <th className="py-3 px-3 font-medium">Due Date</th>
                  <th className="py-3 px-3 font-medium">Account</th>
                  <th className="py-3 px-3 font-medium">Status</th>
                  <th className="py-3 px-3 font-medium text-right">Amount</th>
                  <th className="py-3 pl-3 pr-5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {state.bills
                  .slice()
                  .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  .map((bill) => {
                    const alert = getBillAlertState(bill, referenceDate);
                    const accName = state.accounts.find((a) => a.id === bill.accountId)?.name ?? '';

                    return (
                      <tr key={bill.id} className="hover:bg-white/[0.03]">
                        <td className="py-3 pl-5 pr-3">
                          <div className="text-white font-medium">{bill.name}</div>
                          <div className="text-white/45 mt-0.5 capitalize">
                            {bill.billType} · {bill.frequency} ·{' '}
                            {bill.isEstimated ? 'Estimated amount' : 'Actual / Fixed'}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono-num text-white/75 whitespace-nowrap">
                          {formatDisplayDate(bill.dueDate, state.preferences.dateFormat, locale)}
                        </td>
                        <td className="py-3 px-3 text-white/70 whitespace-nowrap">{accName}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {alert === 'paid' && (
                            <span className="text-emerald-400 font-medium">
                              Paid{bill.lastPaidDate ? ` (${bill.lastPaidDate})` : ''}
                            </span>
                          )}
                          {alert === 'overdue' && <span className="text-red-400 font-medium">Overdue</span>}
                          {alert === 'due-soon' && <span className="text-amber-300 font-medium">Due Soon</span>}
                          {alert === 'upcoming' && <span className="text-white/65">Upcoming</span>}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <CurrencyText
                            minor={bill.amountMinor}
                            currency={bill.currency}
                            locale={locale}
                            className="text-white font-medium"
                          />
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {bill.status === 'unpaid' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayBill(bill);
                                  setPayAmountInput(String(fromMinorUnits(bill.amountMinor, bill.currency)));
                                  setPayDateInput(referenceDate);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white text-black font-medium hover:bg-white/90 inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Mark Paid
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(bill)}
                              aria-label={`Delete ${bill.name}`}
                              className="w-7 h-7 rounded-lg glass-interactive inline-flex items-center justify-center text-red-400/80 hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Add Bill Modal */}
      <GlassModal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Bill Obligation" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="bill-name" className="block text-xs text-white/65 mb-1">Bill Name</label>
              <input id="bill-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full finora-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="bill-type" className="block text-xs text-white/65 mb-1">Type</label>
              <select id="bill-type" value={billType} onChange={(e) => setBillType(e.target.value as BillCategoryType)} className="w-full finora-input px-3 py-2 text-sm">
                {BILL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bill-freq" className="block text-xs text-white/65 mb-1">Frequency</label>
              <select id="bill-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)} className="w-full finora-input px-3 py-2 text-sm">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label htmlFor="bill-amt" className="block text-xs text-white/65 mb-1">Amount</label>
              <input id="bill-amt" type="number" step="any" min="0.01" required value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="bill-curr" className="block text-xs text-white/65 mb-1">Currency</label>
              <select id="bill-curr" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className="w-full finora-input px-3 py-2 text-sm">
                {CURRENCY_LIST.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bill-due" className="block text-xs text-white/65 mb-1">Due Date</label>
              <input id="bill-due" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="bill-rem" className="block text-xs text-white/65 mb-1">Remind Days Before</label>
              <input id="bill-rem" type="number" min="0" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="bill-acc" className="block text-xs text-white/65 mb-1">Payment Account</label>
              <select id="bill-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full finora-input px-3 py-2 text-sm">
                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bill-cat" className="block text-xs text-white/65 mb-1">Expense Category</label>
              <select id="bill-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full finora-input px-3 py-2 text-sm">
                <option value="">Uncategorized</option>
                {state.categories.filter((c) => !c.archived && c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
            <input type="checkbox" checked={isEstimated} onChange={(e) => setIsEstimated(e.target.checked)} />
            Amount is estimated (will be finalized when paid)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90">Save Bill</button>
          </div>
        </form>
      </GlassModal>

      {/* Mark Bill Paid Modal */}
      <GlassModal
        open={Boolean(payBill)}
        onClose={() => setPayBill(null)}
        title={`Record Payment — ${payBill?.name ?? ''}`}
        subtitle="Records an actual completed expense transaction and updates your account balance."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handlePaySubmit} className="space-y-4">
          <div>
            <label htmlFor="pay-amt" className="block text-xs text-white/65 mb-1">
              Actual Paid Amount ({payBill?.currency})
            </label>
            <input id="pay-amt" type="number" step="any" min="0.01" required value={payAmountInput} onChange={(e) => setPayAmountInput(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
          </div>
          <div>
            <label htmlFor="pay-date" className="block text-xs text-white/65 mb-1">Payment Date</label>
            <input id="pay-date" type="date" required value={payDateInput} onChange={(e) => setPayDateInput(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPayBill(null)} className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90">Record Payment</button>
          </div>
        </form>
      </GlassModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteBill(deleteTarget.id); }}
        title="Delete Bill"
        message={`Remove "${deleteTarget?.name ?? ''}" from upcoming obligations?`}
        confirmLabel="Delete Bill"
      />
    </div>
  );
};

export const SubscriptionsView: React.FC = () => {
  const { state, referenceDate, addSubscription, updateSubscription, deleteSubscription } = useLedger();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);

  const [name, setName] = useState('');
  const [vendor, setVendor] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('Software');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [frequency, setFrequency] = useState<Subscription['frequency']>('monthly');
  const [nextBillingDate, setNextBillingDate] = useState(referenceDate);
  const [accountId, setAccountId] = useState('');
  const [usageNote, setUsageNote] = useState('');

  const intel = useMemo(
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

  if (!state || !intel) return null;

  const primary = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;
  const activeAccounts = state.accounts.filter((a) => !a.archived);

  const openCreate = () => {
    setName('');
    setVendor('');
    setCategoryLabel('Software');
    setAmountInput('');
    setCurrency(primary);
    setFrequency('monthly');
    setNextBillingDate(referenceDate);
    setAccountId(activeAccounts[0]?.id ?? '');
    setUsageNote('');
    setCreateOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = toMinorUnits(amountInput, currency);
    if (!name.trim() || amt <= 0 || !accountId) return;
    addSubscription({
      name: name.trim(),
      vendor: vendor.trim() || name.trim(),
      categoryLabel,
      amountMinor: amt,
      currency,
      frequency,
      nextBillingDate,
      accountId,
      categoryId: 'cat-subs',
      status: 'active',
      markedUnusedByUser: false,
      usageNote: usageNote.trim(),
      notes: '',
    });
    setCreateOpen(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Subscription Manager"
        subtitle="Monitor recurring services, annualized commitments, category overlaps, and subscriptions you have flagged for review."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Subscription
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard variant="primary">
          <div className="text-xs text-white/55">Monthly Recurring Cost</div>
          <div className="mt-2.5 text-3xl font-semibold text-white">
            <CurrencyText minor={intel.monthlyTotalMinor} currency={primary} locale={locale} />
          </div>
          <div className="mt-1.5 text-xs text-white/45">{intel.activeCount} active subscriptions</div>
        </GlassCard>

        <GlassCard>
          <div className="text-xs text-white/55">Annualized Cost</div>
          <div className="mt-2.5 text-2xl font-semibold text-white">
            <CurrencyText minor={intel.annualTotalMinor} currency={primary} locale={locale} />
          </div>
          <div className="mt-1.5 text-xs text-white/45">Projected 12-month recurring spend</div>
        </GlassCard>

        <GlassCard>
          <div className="text-xs text-white/55">Renewals Within 30 Days</div>
          <div className="mt-2.5 text-2xl font-semibold text-white font-mono-num">
            {intel.upcomingRenewals.length}
          </div>
          <div className="mt-1.5 text-xs text-white/45">
            {intel.categoryOverlaps.length} overlapping categories detected
          </div>
        </GlassCard>
      </div>

      {/* Overlap & Flagged Unused Intelligence */}
      {(intel.categoryOverlaps.length > 0 || intel.userFlaggedUnused.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {intel.categoryOverlaps.length > 0 && (
            <GlassCard className="space-y-2.5">
              <h2 className="text-sm font-semibold text-white">Category Overlaps</h2>
              <p className="text-xs text-white/50">Multiple active subscriptions in the same category:</p>
              <div className="space-y-2">
                {intel.categoryOverlaps.map((ov) => (
                  <div key={ov.categoryLabel} className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 text-xs flex items-center justify-between gap-3">
                    <div>
                      <div className="text-white font-medium">{ov.categoryLabel}</div>
                      <div className="text-white/50 mt-0.5">
                        {ov.subscriptions.map((s) => s.name).join(' · ')}
                      </div>
                    </div>
                    <CurrencyText minor={ov.monthlyTotalMinor} currency={primary} locale={locale} className="text-white font-medium shrink-0" />
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {intel.userFlaggedUnused.length > 0 && (
            <GlassCard className="space-y-2.5">
              <h2 className="text-sm font-semibold text-white">Flagged as Unused by You</h2>
              <p className="text-xs text-white/50">Subscriptions you marked for cancellation or pause review:</p>
              <div className="space-y-2">
                {intel.userFlaggedUnused.map((sub) => (
                  <div key={sub.id} className="rounded-xl bg-amber-500/10 border border-amber-400/25 p-3 text-xs flex items-center justify-between gap-3">
                    <div>
                      <div className="text-amber-200 font-medium">{sub.name}</div>
                      <div className="text-amber-200/70 mt-0.5">{sub.usageNote || 'Marked unused'}</div>
                    </div>
                    <CurrencyText
                      minor={normalizeToAnnualMinor(sub.amountMinor, sub.frequency)}
                      currency={sub.currency}
                      locale={locale}
                      className="text-amber-200 font-medium shrink-0"
                    />
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {state.subscriptions.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-5 h-5" />}
          title="No subscriptions recorded"
          description="Track streaming, cloud storage, software, and memberships to monitor annualized recurring cost."
          actionLabel="Add Subscription"
          onAction={openCreate}
        />
      ) : (
        <GlassCard variant="table" className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-white/50">
                  <th className="py-3 pl-5 pr-3 font-medium">Service</th>
                  <th className="py-3 px-3 font-medium">Category</th>
                  <th className="py-3 px-3 font-medium">Billing</th>
                  <th className="py-3 px-3 font-medium">Next Renewal</th>
                  <th className="py-3 px-3 font-medium text-right">Annualized</th>
                  <th className="py-3 px-3 font-medium text-right">Amount</th>
                  <th className="py-3 pl-3 pr-5 font-medium text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {state.subscriptions.map((sub) => {
                  const annualized = normalizeToAnnualMinor(sub.amountMinor, sub.frequency);
                  return (
                    <tr key={sub.id} className={sub.status !== 'active' ? 'opacity-55' : 'hover:bg-white/[0.03]'}>
                      <td className="py-3 pl-5 pr-3">
                        <div className="text-white font-medium">{sub.name}</div>
                        <div className="text-white/45 mt-0.5">
                          {sub.vendor} · {sub.status}
                          {sub.markedUnusedByUser ? ' · Marked unused' : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-white/75">{sub.categoryLabel}</td>
                      <td className="py-3 px-3 text-white/75 capitalize">{sub.frequency}</td>
                      <td className="py-3 px-3 font-mono-num text-white/75">
                        {formatDisplayDate(sub.nextBillingDate, state.preferences.dateFormat, locale)}
                      </td>
                      <td className="py-3 px-3 text-right text-white/65">
                        <CurrencyText minor={annualized} currency={sub.currency} locale={locale} />
                      </td>
                      <td className="py-3 px-3 text-right text-white font-medium">
                        <CurrencyText minor={sub.amountMinor} currency={sub.currency} locale={locale} />
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateSubscription(sub.id, { markedUnusedByUser: !sub.markedUnusedByUser })
                            }
                            className={`px-2 py-1 rounded-lg glass-interactive text-[11px] ${
                              sub.markedUnusedByUser ? 'text-amber-300' : 'text-white/70'
                            }`}
                          >
                            {sub.markedUnusedByUser ? 'Unused' : 'Mark Unused'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSubscription(sub.id, {
                                status: sub.status === 'active' ? 'paused' : 'active',
                              })
                            }
                            aria-label={sub.status === 'active' ? `Pause ${sub.name}` : `Resume ${sub.name}`}
                            className="w-7 h-7 rounded-lg glass-interactive inline-flex items-center justify-center text-white/70 hover:text-white"
                          >
                            {sub.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(sub)}
                            aria-label={`Delete ${sub.name}`}
                            className="w-7 h-7 rounded-lg glass-interactive inline-flex items-center justify-center text-red-400/80 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <GlassModal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Subscription" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sub-name" className="block text-xs text-white/65 mb-1">Service Name</label>
              <input id="sub-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full finora-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="sub-vendor" className="block text-xs text-white/65 mb-1">Vendor</label>
              <input id="sub-vendor" type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} className="w-full finora-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="sub-cat" className="block text-xs text-white/65 mb-1">Category</label>
              <select id="sub-cat" value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} className="w-full finora-input px-3 py-2 text-sm">
                <option value="Streaming">Streaming</option>
                <option value="Software">Software</option>
                <option value="Cloud Storage">Cloud Storage</option>
                <option value="Membership">Membership</option>
                <option value="Gaming">Gaming</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="sub-freq" className="block text-xs text-white/65 mb-1">Billing Frequency</label>
              <select id="sub-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as Subscription['frequency'])} className="w-full finora-input px-3 py-2 text-sm">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label htmlFor="sub-amt" className="block text-xs text-white/65 mb-1">Amount</label>
              <input id="sub-amt" type="number" step="any" min="0.01" required value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="sub-curr" className="block text-xs text-white/65 mb-1">Currency</label>
              <select id="sub-curr" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className="w-full finora-input px-3 py-2 text-sm">
                {CURRENCY_LIST.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sub-next" className="block text-xs text-white/65 mb-1">Next Billing Date</label>
              <input id="sub-next" type="date" required value={nextBillingDate} onChange={(e) => setNextBillingDate(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="sub-acc" className="block text-xs text-white/65 mb-1">Payment Account</label>
              <select id="sub-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full finora-input px-3 py-2 text-sm">
                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="sub-usage" className="block text-xs text-white/65 mb-1">Usage Note (optional)</label>
              <input id="sub-usage" type="text" value={usageNote} onChange={(e) => setUsageNote(e.target.value)} placeholder="e.g., Daily use or rarely used" className="w-full finora-input px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90">Save Subscription</button>
          </div>
        </form>
      </GlassModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteSubscription(deleteTarget.id); }}
        title="Delete Subscription"
        message={`Remove "${deleteTarget?.name ?? ''}" from subscription tracking?`}
        confirmLabel="Delete Subscription"
      />
    </div>
  );
};

export const RecurringView: React.FC = () => {
  const {
    state,
    referenceDate,
    addRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    recordRecurringOccurrenceNow,
  } = useLedger();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecurringRule | null>(null);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [customDays, setCustomDays] = useState('14');
  const [startDate, setStartDate] = useState(referenceDate);
  const [endDate, setEndDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');

  if (!state) return null;

  const activeAccounts = state.accounts.filter((a) => !a.archived);
  const primary = state.preferences.primaryCurrency;
  const locale = state.preferences.locale;
  const summary = computeRecurringSummary(state.recurringRules, primary, state.fxRates);

  const openCreate = () => {
    setTitle('');
    setType('expense');
    setAmountInput('');
    setCurrency(primary);
    setFrequency('monthly');
    setCustomDays('14');
    setStartDate(referenceDate);
    setEndDate('');
    setAccountId(activeAccounts[0]?.id ?? '');
    setToAccountId(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? '');
    setCategoryId('');
    setMerchant('');
    setCreateOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = toMinorUnits(amountInput, currency);
    if (!title.trim() || amt <= 0 || !accountId) return;
    addRecurringRule({
      title: title.trim(),
      type,
      amountMinor: amt,
      currency,
      frequency,
      customIntervalDays: frequency === 'custom' ? Math.max(1, Number(customDays) || 14) : undefined,
      startDate,
      endDate: endDate || null,
      nextOccurrenceDate: computeNextOccurrenceDate(startDate, frequency, Number(customDays) || 14),
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId || null,
      paymentMethod: type === 'transfer' ? 'Internal Transfer' : 'Scheduled',
      merchant: merchant.trim(),
      active: true,
      notes: '',
    });
    setCreateOpen(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Recurring Transactions"
        subtitle="Configure scheduled income, expenses, and transfers. Scheduled rules never deduct money automatically until you confirm and record an occurrence."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Recurring Rule
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard>
          <div className="text-xs text-white/55">Scheduled Monthly Inflow</div>
          <div className="mt-2.5 text-2xl font-semibold text-emerald-400">
            <CurrencyText minor={summary.monthlyIncomeMinor} currency={primary} locale={locale} showPlus />
          </div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs text-white/55">Scheduled Monthly Outflow</div>
          <div className="mt-2.5 text-2xl font-semibold text-red-400">
            <CurrencyText minor={summary.monthlyExpensesMinor} currency={primary} locale={locale} />
          </div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs text-white/55">Active Rules</div>
          <div className="mt-2.5 text-2xl font-semibold text-white font-mono-num">
            {summary.activeCount}
          </div>
        </GlassCard>
      </div>

      {state.recurringRules.length === 0 ? (
        <EmptyState
          icon={<Repeat className="w-5 h-5" />}
          title="No recurring rules"
          description="Set up daily, weekly, biweekly, monthly, quarterly, yearly, or custom-interval schedules."
          actionLabel="Create Recurring Rule"
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-3">
          {state.recurringRules.map((rule) => {
            const accName = state.accounts.find((a) => a.id === rule.accountId)?.name ?? '';
            return (
              <GlassCard key={rule.id} className={!rule.active ? 'opacity-55' : ''}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{rule.title}</h3>
                      <span className="text-[11px] text-white/50 capitalize">· {rule.type} · {rule.frequency}</span>
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      Scheduled (not yet posted) · Next occurrence:{' '}
                      <span className="font-mono-num text-white/80">
                        {formatDisplayDate(rule.nextOccurrenceDate, state.preferences.dateFormat, locale)}
                      </span>{' '}
                      · {accName}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <CurrencyText
                      minor={rule.amountMinor}
                      currency={rule.currency}
                      locale={locale}
                      className={
                        rule.type === 'income'
                          ? 'text-emerald-400 font-semibold'
                          : rule.type === 'expense'
                          ? 'text-red-400 font-semibold'
                          : 'text-white font-semibold'
                      }
                    />
                    <button
                      type="button"
                      onClick={() => recordRecurringOccurrenceNow(rule.id)}
                      className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 whitespace-nowrap"
                    >
                      Record Occurrence
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRecurringRule(rule.id, { active: !rule.active })}
                      aria-label={rule.active ? `Pause ${rule.title}` : `Resume ${rule.title}`}
                      className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/70 hover:text-white"
                    >
                      {rule.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(rule)}
                      aria-label={`Delete ${rule.title}`}
                      className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-red-400/80 hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <GlassModal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Recurring Rule" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="rec-title" className="block text-xs text-white/65 mb-1">Title</label>
              <input id="rec-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full finora-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="rec-type" className="block text-xs text-white/65 mb-1">Type</label>
              <select id="rec-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full finora-input px-3 py-2 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div>
              <label htmlFor="rec-freq" className="block text-xs text-white/65 mb-1">Frequency</label>
              <select id="rec-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)} className="w-full finora-input px-3 py-2 text-sm">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom Interval (Days)</option>
              </select>
            </div>
            {frequency === 'custom' && (
              <div>
                <label htmlFor="rec-days" className="block text-xs text-white/65 mb-1">Interval (Days)</label>
                <input id="rec-days" type="number" min="1" value={customDays} onChange={(e) => setCustomDays(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
              </div>
            )}
            <div>
              <label htmlFor="rec-amt" className="block text-xs text-white/65 mb-1">Amount</label>
              <input id="rec-amt" type="number" step="any" min="0.01" required value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="rec-curr" className="block text-xs text-white/65 mb-1">Currency</label>
              <select id="rec-curr" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className="w-full finora-input px-3 py-2 text-sm">
                {CURRENCY_LIST.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rec-start" className="block text-xs text-white/65 mb-1">Start Date</label>
              <input id="rec-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="rec-end" className="block text-xs text-white/65 mb-1">End Date (optional)</label>
              <input id="rec-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full finora-input px-3 py-2 text-sm font-mono-num" />
            </div>
            <div>
              <label htmlFor="rec-acc" className="block text-xs text-white/65 mb-1">{type === 'transfer' ? 'From Account' : 'Account'}</label>
              <select id="rec-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full finora-input px-3 py-2 text-sm">
                {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {type === 'transfer' ? (
              <div>
                <label htmlFor="rec-to-acc" className="block text-xs text-white/65 mb-1">To Account</label>
                <select id="rec-to-acc" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="w-full finora-input px-3 py-2 text-sm">
                  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="rec-cat" className="block text-xs text-white/65 mb-1">Category</label>
                <select id="rec-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full finora-input px-3 py-2 text-sm">
                  <option value="">Uncategorized</option>
                  {state.categories.filter((c) => !c.archived && c.kind === type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90">Create Schedule</button>
          </div>
        </form>
      </GlassModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteRecurringRule(deleteTarget.id); }}
        title="Delete Recurring Rule"
        message={`Delete recurring schedule "${deleteTarget?.title ?? ''}"? Past recorded transactions remain untouched.`}
        confirmLabel="Delete Rule"
      />
    </div>
  );
};

export const BillsAndSubscriptionsView: React.FC = () => {
  const [tab, setTab] = useState<'bills' | 'subscriptions' | 'recurring'>('bills');

  return (
    <div className="space-y-5">
      <SegmentedControl<'bills' | 'subscriptions' | 'recurring'>
        ariaLabel="Bills and subscriptions tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bills', label: 'Upcoming Bills' },
          { value: 'subscriptions', label: 'Subscriptions' },
          { value: 'recurring', label: 'Recurring Rules' },
        ]}
      />
      {tab === 'bills' && <BillsView />}
      {tab === 'subscriptions' && <SubscriptionsView />}
      {tab === 'recurring' && <RecurringView />}
    </div>
  );
};


import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Paperclip, Sparkles, Trash2 } from 'lucide-react';
import { CURRENCY_LIST, fromMinorUnits, toMinorUnits } from '../../core/money';
import { suggestTransactionIntelligence } from '../../core/intelligence';
import type {
  CurrencyCode,
  ReceiptAttachment,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import { GlassModal, SegmentedControl } from '../ui/GlassPrimitives';

const PAYMENT_METHODS = [
  'Debit Card',
  'Credit Card',
  'ACH Transfer',
  'Direct Deposit',
  'Wire Transfer',
  'Internal Transfer',
  'Apple Pay',
  'Cash',
  'Card Refund',
  'Other',
];

export const TransactionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  editingTransaction?: Transaction | null;
  defaultType?: TransactionType;
  defaultAccountId?: string;
}> = ({ open, onClose, editingTransaction, defaultType = 'expense', defaultAccountId }) => {
  const { state, addTransaction, updateTransaction, referenceDate } = useLedger();

  const activeAccounts = useMemo(
    () => (state ? state.accounts.filter((a) => !a.archived) : []),
    [state]
  );

  const [type, setType] = useState<TransactionType>(defaultType);
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [date, setDate] = useState(referenceDate);
  const [time, setTime] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'credit' | 'debit'>('credit');
  const [categoryId, setCategoryId] = useState<string>('');
  const [merchant, setMerchant] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Credit Card');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('completed');
  const [receipt, setReceipt] = useState<ReceiptAttachment | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !state) return;
    setFormError(null);

    if (editingTransaction) {
      setType(editingTransaction.type);
      setDescription(editingTransaction.description);
      setAmountInput(String(fromMinorUnits(editingTransaction.amountMinor, editingTransaction.currency)));
      setCurrency(editingTransaction.currency);
      setDate(editingTransaction.date);
      setTime(editingTransaction.time ?? '');
      setAccountId(editingTransaction.accountId);
      setToAccountId(editingTransaction.toAccountId ?? '');
      setAdjustmentDirection(editingTransaction.adjustmentDirection ?? 'credit');
      setCategoryId(editingTransaction.categoryId ?? '');
      setMerchant(editingTransaction.merchant);
      setPaymentMethod(editingTransaction.paymentMethod);
      setTagsInput(editingTransaction.tags.join(', '));
      setNotes(editingTransaction.notes);
      setStatus(editingTransaction.status);
      setReceipt(editingTransaction.receipt ?? null);
    } else {
      const firstAcc =
        activeAccounts.find((a) => a.id === defaultAccountId) ?? activeAccounts[0];
      const secondAcc = activeAccounts.find((a) => a.id !== firstAcc?.id) ?? firstAcc;
      setType(defaultType);
      setDescription('');
      setAmountInput('');
      setCurrency(firstAcc?.currency ?? state.preferences.primaryCurrency);
      setDate(referenceDate);
      setTime('');
      setAccountId(firstAcc?.id ?? '');
      setToAccountId(secondAcc?.id ?? '');
      setAdjustmentDirection('credit');
      setCategoryId('');
      setMerchant('');
      setPaymentMethod(defaultType === 'transfer' ? 'Internal Transfer' : defaultType === 'income' ? 'Direct Deposit' : 'Credit Card');
      setTagsInput('');
      setNotes('');
      setStatus('completed');
      setReceipt(null);
    }
  }, [open, editingTransaction, defaultType, defaultAccountId, state, activeAccounts, referenceDate]);

  const eligibleCategories = useMemo(() => {
    if (!state) return [];
    const kind = type === 'income' ? 'income' : 'expense';
    return state.categories.filter((c) => !c.archived && c.kind === kind);
  }, [state, type]);

  const parsedMinor = toMinorUnits(amountInput, currency);

  const intelligence = useMemo(() => {
    if (!state || type === 'transfer' || type === 'adjustment') return null;
    return suggestTransactionIntelligence(
      {
        type,
        description,
        merchant,
        amountMinor: parsedMinor,
        date,
        accountId,
        excludeId: editingTransaction?.id,
      },
      state.transactions,
      state.categories
    );
  }, [state, type, description, merchant, parsedMinor, date, accountId, editingTransaction?.id]);

  if (!state) return null;

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      setFormError('Receipt attachment must be 1.5 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceipt({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!description.trim()) {
      setFormError('Description is required.');
      return;
    }
    if (parsedMinor <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }
    if (!accountId) {
      setFormError('Select an account.');
      return;
    }
    if (type === 'transfer') {
      if (!toAccountId || toAccountId === accountId) {
        setFormError('Select a different destination account for a transfer.');
        return;
      }
    }
    if (!date) {
      setFormError('Date is required.');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      type,
      description: description.trim(),
      amountMinor: parsedMinor,
      adjustmentDirection: type === 'adjustment' ? adjustmentDirection : undefined,
      currency,
      date,
      time: time.trim() || undefined,
      categoryId: type === 'transfer' || type === 'adjustment' ? null : categoryId || null,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      paymentMethod,
      merchant: merchant.trim(),
      notes: notes.trim(),
      tags,
      receipt,
      status,
    };

    if (editingTransaction) {
      updateTransaction(editingTransaction.id, payload);
    } else {
      addTransaction(payload);
    }
    onClose();
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={editingTransaction ? 'Edit Transaction' : 'Record Transaction'}
      subtitle="All entries immediately reconcile with account balances and budgets."
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            ariaLabel="Transaction type"
            value={type}
            onChange={(val) => {
              setType(val);
              if (val === 'transfer') {
                setPaymentMethod('Internal Transfer');
                setCategoryId('');
              }
            }}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'refund', label: 'Refund' },
              { value: 'adjustment', label: 'Adjustment' },
            ]}
          />

          <SegmentedControl
            ariaLabel="Transaction status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'completed', label: 'Completed' },
              { value: 'scheduled', label: 'Scheduled' },
            ]}
          />
        </div>

        {/* Transaction Intelligence Banners (non-intrusive, never auto-mutates) */}
        {intelligence?.suggestedCategoryId && categoryId !== intelligence.suggestedCategoryId && (
          <div className="rounded-xl bg-white/[0.05] border border-white/[0.12] px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-white/80 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-white/80 shrink-0" />
              <span className="truncate">
                Suggested category: <strong className="text-white">{intelligence.suggestedCategoryName}</strong> ({intelligence.suggestionReason})
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCategoryId(intelligence.suggestedCategoryId!);
                if (!merchant && intelligence.normalizedMerchant) {
                  setMerchant(intelligence.normalizedMerchant);
                }
              }}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-black hover:bg-white/90 shrink-0"
            >
              Apply
            </button>
          </div>
        )}

        {intelligence?.potentialDuplicate && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-medium text-amber-300">Potential duplicate detected:</strong>{' '}
              A matching entry "{intelligence.potentialDuplicate.description}" on{' '}
              {intelligence.potentialDuplicate.date} is already recorded in this account.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <label htmlFor="tx-desc" className="block text-xs text-white/65 mb-1">
              Description
            </label>
            <input
              id="tx-desc"
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Weekly Groceries, Salary Deposit, Rent Payment"
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="tx-amount" className="block text-xs text-white/65 mb-1">
              Amount
            </label>
            <input
              id="tx-amount"
              type="number"
              step="any"
              min="0.01"
              required
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>

          <div>
            <label htmlFor="tx-currency" className="block text-xs text-white/65 mb-1">
              Currency
            </label>
            <select
              id="tx-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full finora-input px-3 py-2 text-sm"
            >
              {CURRENCY_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tx-date" className="block text-xs text-white/65 mb-1">
              Date
            </label>
            <input
              id="tx-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>

          <div>
            <label htmlFor="tx-time" className="block text-xs text-white/65 mb-1">
              Time (optional)
            </label>
            <input
              id="tx-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>

          <div>
            <label htmlFor="tx-account" className="block text-xs text-white/65 mb-1">
              {type === 'transfer' ? 'From Account' : 'Account'}
            </label>
            <select
              id="tx-account"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                const acc = activeAccounts.find((a) => a.id === e.target.value);
                if (acc && !editingTransaction) setCurrency(acc.currency);
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

          {type === 'transfer' ? (
            <div>
              <label htmlFor="tx-to-account" className="block text-xs text-white/65 mb-1">
                To Account
              </label>
              <select
                id="tx-to-account"
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
          ) : type === 'adjustment' ? (
            <div>
              <label htmlFor="tx-adj-dir" className="block text-xs text-white/65 mb-1">
                Adjustment Direction
              </label>
              <select
                id="tx-adj-dir"
                value={adjustmentDirection}
                onChange={(e) => setAdjustmentDirection(e.target.value as 'credit' | 'debit')}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                <option value="credit">Increase Balance (+)</option>
                <option value="debit">Decrease Balance (-)</option>
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="tx-category" className="block text-xs text-white/65 mb-1">
                Category
              </label>
              <select
                id="tx-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                <option value="">Uncategorized</option>
                {eligibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="tx-merchant" className="block text-xs text-white/65 mb-1">
              {type === 'income' ? 'Source / Payer' : 'Merchant'}
            </label>
            <input
              id="tx-merchant"
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g., Whole Foods Market"
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="tx-method" className="block text-xs text-white/65 mb-1">
              Payment Method
            </label>
            <select
              id="tx-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="tx-tags" className="block text-xs text-white/65 mb-1">
              Tags (comma separated)
            </label>
            <input
              id="tx-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g., reimbursable, work, travel"
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="tx-notes" className="block text-xs text-white/65 mb-1">
              Notes
            </label>
            <textarea
              id="tx-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context or memo"
              className="w-full finora-input px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="sm:col-span-2">
            <span className="block text-xs text-white/65 mb-1">Receipt Attachment (optional)</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="glass-interactive px-3 py-2 rounded-xl text-xs font-medium text-white/85 cursor-pointer inline-flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5" />
                {receipt ? 'Replace Receipt' : 'Attach Image / PDF'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleReceiptChange}
                  className="sr-only"
                />
              </label>
              {receipt && (
                <div className="flex items-center gap-2 text-xs text-white/75">
                  <span className="truncate max-w-[220px]">{receipt.name}</span>
                  <button
                    type="button"
                    onClick={() => setReceipt(null)}
                    aria-label="Remove receipt"
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {formError && (
          <p role="alert" className="text-xs text-red-400">
            {formError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-xl glass-interactive text-white/80 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90 transition-colors"
          >
            {editingTransaction ? 'Save Changes' : 'Save Transaction'}
          </button>
        </div>
      </form>
    </GlassModal>
  );
};

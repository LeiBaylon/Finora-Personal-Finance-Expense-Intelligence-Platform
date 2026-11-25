import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeftRight,
  Edit3,
  Landmark,
  Plus,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { computeAllAccountBalances } from '../../core/accounting';
import { CURRENCY_LIST, formatDisplayDate, fromMinorUnits, toMinorUnits } from '../../core/money';
import type { Account, AccountType, Category, CurrencyCode } from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import { TransactionModal } from '../modals/TransactionModal';
import {
  CurrencyText,
  GlassCard,
  GlassModal,
  SectionHeader,
  SegmentedControl,
} from '../ui/GlassPrimitives';

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'e_wallet', label: 'E-Wallet' },
  { value: 'other', label: 'Other' },
];

export const AccountsView: React.FC = () => {
  const {
    state,
    addAccount,
    updateAccount,
    adjustAccountOpeningBalance,
    archiveAccount,
  } = useLedger();

  const [accModalOpen, setAccModalOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [adjustAcc, setAdjustAcc] = useState<Account | null>(null);
  const [inspectAccId, setInspectAccId] = useState<string | null>(null);

  // Account form state
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [openingInput, setOpeningInput] = useState('0');
  const [description, setDescription] = useState('');
  const [includeInTotal, setIncludeInTotal] = useState(true);

  // Opening balance adjustment state
  const [adjInput, setAdjInput] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const balances = useMemo(
    () =>
      state ? computeAllAccountBalances(state.accounts, state.transactions, state.fxRates) : {},
    [state]
  );

  if (!state) return null;

  const openCreate = () => {
    setEditingAcc(null);
    setName('');
    setType('checking');
    setCurrency(state.preferences.primaryCurrency);
    setOpeningInput('0');
    setDescription('');
    setIncludeInTotal(true);
    setAccModalOpen(true);
  };

  const openEdit = (acc: Account) => {
    setEditingAcc(acc);
    setName(acc.name);
    setType(acc.type);
    setCurrency(acc.currency);
    setOpeningInput(String(fromMinorUnits(acc.openingBalanceMinor, acc.currency)));
    setDescription(acc.description);
    setIncludeInTotal(acc.includeInTotal);
    setAccModalOpen(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingAcc) {
      updateAccount(editingAcc.id, {
        name: name.trim(),
        type,
        currency,
        description: description.trim(),
        includeInTotal,
      });
    } else {
      addAccount({
        name: name.trim(),
        type,
        currency,
        openingBalanceMinor: toMinorUnits(openingInput, currency),
        description: description.trim(),
        includeInTotal,
        archived: false,
      });
    }
    setAccModalOpen(false);
  };

  const handleAdjustOpening = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustAcc) return;
    const nextMinor = toMinorUnits(adjInput, adjustAcc.currency);
    adjustAccountOpeningBalance(
      adjustAcc.id,
      nextMinor,
      adjReason.trim() || `Adjusted opening balance for ${adjustAcc.name}`
    );
    setAdjustAcc(null);
  };

  const inspectedAccount = state.accounts.find((a) => a.id === inspectAccId) ?? null;
  const inspectedTxs = inspectedAccount
    ? state.transactions
        .filter((t) => t.accountId === inspectedAccount.id || t.toAccountId === inspectedAccount.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Accounts"
        subtitle="Manage checking, savings, cash, credit cards, and e-wallets. Transfers move balances between accounts without inflating income or expenses."
        action={
          <>
            <button
              type="button"
              onClick={() => setTransferModalOpen(true)}
              className="glass-interactive px-3.5 py-2 rounded-xl text-xs font-medium text-white/85 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Transfer Funds
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Account
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {state.accounts.map((acc) => {
          const bal = balances[acc.id] ?? 0;
          const txCount = state.transactions.filter(
            (t) => t.accountId === acc.id || t.toAccountId === acc.id
          ).length;

          return (
            <GlassCard
              key={acc.id}
              className={`flex flex-col justify-between ${acc.archived ? 'opacity-55' : ''}`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl glass-interactive flex items-center justify-center text-white/75 shrink-0">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{acc.name}</h3>
                      <div className="text-[11px] text-white/50">
                        {ACCOUNT_TYPES.find((t) => t.value === acc.type)?.label} · {acc.currency}
                        {acc.archived ? ' · Archived' : ''}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-2xl font-semibold text-white">
                  <CurrencyText
                    minor={bal}
                    currency={acc.currency}
                    locale={state.preferences.locale}
                    className={bal < 0 ? 'text-red-400' : 'text-white'}
                  />
                </div>
                <p className="text-xs text-white/50 mt-1 line-clamp-2">
                  {acc.description || 'No description'}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setInspectAccId(acc.id)}
                  className="text-white/75 hover:text-white underline"
                >
                  {txCount} transactions
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustAcc(acc);
                      setAdjInput(String(fromMinorUnits(acc.openingBalanceMinor, acc.currency)));
                      setAdjReason('');
                    }}
                    aria-label={`Adjust opening balance for ${acc.name}`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/70 hover:text-white"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(acc)}
                    aria-label={`Edit ${acc.name}`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/70 hover:text-white"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveAccount(acc.id, !acc.archived)}
                    aria-label={acc.archived ? `Restore ${acc.name}` : `Archive ${acc.name}`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/70 hover:text-white"
                  >
                    {acc.archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Create/Edit Account Modal */}
      <GlassModal
        open={accModalOpen}
        onClose={() => setAccModalOpen(false)}
        title={editingAcc ? `Edit ${editingAcc.name}` : 'Create Account'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div>
            <label htmlFor="acc-name" className="block text-xs text-white/65 mb-1">
              Account Name
            </label>
            <input
              id="acc-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Checking, Emergency Reserve"
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="acc-type" className="block text-xs text-white/65 mb-1">
                Account Type
              </label>
              <select
                id="acc-type"
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="acc-curr" className="block text-xs text-white/65 mb-1">
                Currency
              </label>
              <select
                id="acc-curr"
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
          </div>

          {!editingAcc && (
            <div>
              <label htmlFor="acc-open-bal" className="block text-xs text-white/65 mb-1">
                Opening Balance
              </label>
              <input
                id="acc-open-bal"
                type="number"
                step="any"
                value={openingInput}
                onChange={(e) => setOpeningInput(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm font-mono-num"
              />
            </div>
          )}

          <div>
            <label htmlFor="acc-desc" className="block text-xs text-white/65 mb-1">
              Description
            </label>
            <input
              id="acc-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInTotal}
              onChange={(e) => setIncludeInTotal(e.target.checked)}
              className="rounded"
            />
            Include account balance in Total Available Balance
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAccModalOpen(false)}
              className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90"
            >
              {editingAcc ? 'Save Account' : 'Create Account'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Adjust Opening Balance Modal */}
      <GlassModal
        open={Boolean(adjustAcc)}
        onClose={() => setAdjustAcc(null)}
        title={`Adjust Opening Balance — ${adjustAcc?.name ?? ''}`}
        subtitle="Changes are logged in Activity History for audit reconciliation."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAdjustOpening} className="space-y-4">
          <div>
            <label htmlFor="adj-bal" className="block text-xs text-white/65 mb-1">
              New Opening Balance ({adjustAcc?.currency})
            </label>
            <input
              id="adj-bal"
              type="number"
              step="any"
              required
              value={adjInput}
              onChange={(e) => setAdjInput(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm font-mono-num"
            />
          </div>
          <div>
            <label htmlFor="adj-reason" className="block text-xs text-white/65 mb-1">
              Reason / Audit Note
            </label>
            <input
              id="adj-reason"
              type="text"
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="e.g., Reconciled against initial bank statement"
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAdjustAcc(null)}
              className="px-4 py-2 text-xs rounded-xl glass-interactive text-white/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-white/90"
            >
              Apply Adjustment
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Per-account Transaction History Modal */}
      <GlassModal
        open={Boolean(inspectedAccount)}
        onClose={() => setInspectAccId(null)}
        title={`${inspectedAccount?.name ?? ''} — Account History`}
        subtitle={`Opening balance: ${
          inspectedAccount
            ? fromMinorUnits(inspectedAccount.openingBalanceMinor, inspectedAccount.currency)
            : 0
        } ${inspectedAccount?.currency ?? ''}`}
        maxWidthClass="max-w-2xl"
      >
        {inspectedTxs.length === 0 ? (
          <p className="text-xs text-white/55">No transactions recorded on this account yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {inspectedTxs.map((tx) => {
              const isIncomingTransfer =
                tx.type === 'transfer' && tx.toAccountId === inspectedAccount?.id;
              const signed =
                tx.type === 'income' || tx.type === 'refund' || isIncomingTransfer
                  ? tx.amountMinor
                  : -tx.amountMinor;
              return (
                <div key={tx.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{tx.description}</div>
                    <div className="text-white/45 mt-0.5">
                      {formatDisplayDate(tx.date, state.preferences.dateFormat, state.preferences.locale)} ·{' '}
                      {tx.type}
                    </div>
                  </div>
                  <CurrencyText
                    minor={signed}
                    currency={tx.currency}
                    locale={state.preferences.locale}
                    showPlus
                    className={signed >= 0 ? 'text-emerald-400 font-medium' : 'text-white font-medium'}
                  />
                </div>
              );
            })}
          </div>
        )}
      </GlassModal>

      <TransactionModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        defaultType="transfer"
      />
    </div>
  );
};

export const CategoriesView: React.FC = () => {
  const { state, addCategory, updateCategory, archiveCategory } = useLedger();
  const [kindFilter, setKindFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [group, setGroup] = useState('Discretionary');

  if (!state) return null;

  const list = state.categories.filter((c) => kindFilter === 'all' || c.kind === kindFilter);

  const openCreate = () => {
    setEditingCat(null);
    setName('');
    setKind('expense');
    setGroup('Discretionary');
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCat(cat);
    setName(cat.name);
    setKind(cat.kind);
    setGroup(cat.group);
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingCat) {
      updateCategory(editingCat.id, { name: name.trim(), kind, group: group.trim() });
    } else {
      addCategory({
        name: name.trim(),
        kind,
        group: group.trim() || 'Custom',
        isCustom: true,
        archived: false,
      });
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Categories"
        subtitle="Customize expense and income classifications used across transactions, budgets, and reports."
        action={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Category
          </button>
        }
      />

      <SegmentedControl<'all' | 'expense' | 'income'>
        ariaLabel="Filter categories by kind"
        value={kindFilter}
        onChange={setKindFilter}
        options={[
          { value: 'all', label: 'All Categories' },
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {list.map((cat) => {
          const count = state.transactions.filter((t) => t.categoryId === cat.id).length;
          return (
            <GlassCard key={cat.id} className={cat.archived ? 'opacity-50' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">{cat.name}</h3>
                  <div className="text-xs text-white/50 mt-0.5">
                    {cat.kind === 'income' ? 'Income' : 'Expense'} · {cat.group} · {count} entries
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(cat)}
                    aria-label={`Edit ${cat.name}`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/65 hover:text-white"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveCategory(cat.id, !cat.archived)}
                    aria-label={cat.archived ? `Restore ${cat.name}` : `Archive ${cat.name}`}
                    className="w-7 h-7 rounded-lg glass-interactive flex items-center justify-center text-white/65 hover:text-white"
                  >
                    {cat.archived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <GlassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCat ? `Edit ${editingCat.name}` : 'New Category'}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="cat-name-input" className="block text-xs text-white/65 mb-1">
              Name
            </label>
            <input
              id="cat-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full finora-input px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cat-kind-input" className="block text-xs text-white/65 mb-1">
                Kind
              </label>
              <select
                id="cat-kind-input"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'expense' | 'income')}
                className="w-full finora-input px-3 py-2 text-sm"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label htmlFor="cat-group-input" className="block text-xs text-white/65 mb-1">
                Group
              </label>
              <input
                id="cat-group-input"
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full finora-input px-3 py-2 text-sm"
              />
            </div>
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
              Save Category
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
};

export const AccountsAndCategoriesView: React.FC = () => {
  const [tab, setTab] = useState<'accounts' | 'categories'>('accounts');

  return (
    <div className="space-y-5">
      <SegmentedControl<'accounts' | 'categories'>
        ariaLabel="Accounts and categories tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'accounts', label: 'Accounts' },
          { value: 'categories', label: 'Categories' },
        ]}
      />
      {tab === 'accounts' ? <AccountsView /> : <CategoriesView />}
    </div>
  );
};


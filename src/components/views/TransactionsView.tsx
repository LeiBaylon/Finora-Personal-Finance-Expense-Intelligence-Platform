import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Copy,
  Download,
  Edit3,
  Eye,
  Paperclip,
  Plus,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import { transactionsToCsv } from '../../core/importExport';
import { convertMinorUnits, formatDisplayDate } from '../../core/money';
import type { Transaction, TransactionType } from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import { TransactionModal } from '../modals/TransactionModal';
import {
  ConfirmDialog,
  CurrencyText,
  EmptyState,
  GlassCard,
  GlassModal,
  SectionHeader,
  SegmentedControl,
} from '../ui/GlassPrimitives';

export const TransactionsView: React.FC<{
  initialCategoryFilter?: string;
}> = ({ initialCategoryFilter = 'all' }) => {
  const {
    state,
    deleteTransaction,
    duplicateTransaction,
    bulkCategorizeTransactions,
    notify,
  } = useLedger();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategoryFilter);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCatId, setBulkCatId] = useState<string>('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();

    const list = state.transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'uncategorized' && tx.categoryId !== null) return false;
        if (categoryFilter !== 'uncategorized' && tx.categoryId !== categoryFilter) return false;
      }
      if (accountFilter !== 'all' && tx.accountId !== accountFilter && tx.toAccountId !== accountFilter) {
        return false;
      }
      if (startDate && tx.date < startDate) return false;
      if (endDate && tx.date > endDate) return false;
      if (q) {
        const catName =
          state.categories.find((c) => c.id === tx.categoryId)?.name.toLowerCase() ?? '';
        const haystack = `${tx.description} ${tx.merchant} ${tx.notes} ${tx.tags.join(' ')} ${catName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'date-desc') return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
      if (sortBy === 'date-asc') return a.date.localeCompare(b.date);
      if (sortBy === 'amount-desc') return b.amountMinor - a.amountMinor;
      return a.amountMinor - b.amountMinor;
    });

    return list;
  }, [state, search, typeFilter, categoryFilter, accountFilter, startDate, endDate, sortBy]);

  if (!state) return null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = pageItems.map((i) => i.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const applyBulkCategorize = () => {
    if (selectedIds.length === 0) return;
    bulkCategorizeTransactions(selectedIds, bulkCatId || null);
    setSelectedIds([]);
  };

  const primaryCurrency = state.preferences.primaryCurrency;
  const filteredTotals = filtered.reduce(
    (acc, tx) => {
      if (tx.status !== 'completed') return acc;
      const conv = convertMinorUnits(tx.amountMinor, tx.currency, primaryCurrency, state.fxRates);
      const amt = conv.convertedMinor ?? 0;
      if (tx.type === 'income') acc.income += amt;
      else if (tx.type === 'expense') acc.expenses += amt;
      else if (tx.type === 'refund') acc.expenses = Math.max(0, acc.expenses - amt);
      return acc;
    },
    { income: 0, expenses: 0 }
  );

  const handleExportFilteredCsv = () => {
    const csv = transactionsToCsv(filtered, state);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finora-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${filtered.length} transactions to CSV.`, 'success');
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Transactions"
        subtitle="Track income, daily expenses, internal transfers, and refunds in one unified ledger."
        action={
          <>
            <button
              type="button"
              onClick={handleExportFilteredCsv}
              className="glass-interactive px-3.5 py-2 rounded-xl text-xs font-medium text-white/85 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingTx(null);
                setModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Transaction
            </button>
          </>
        }
      />

      {/* Quick Totals & Type Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<'all' | TransactionType>
          ariaLabel="Quick transaction type tabs"
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfers' },
            { value: 'refund', label: 'Refunds' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-white/55">
            Income:{' '}
            <CurrencyText
              minor={filteredTotals.income}
              currency={primaryCurrency}
              locale={state.preferences.locale}
              showPlus
              className="text-emerald-400 font-medium"
            />
          </span>
          <span className="text-white/55">
            Expenses:{' '}
            <CurrencyText
              minor={filteredTotals.expenses}
              currency={primaryCurrency}
              locale={state.preferences.locale}
              className="text-red-400 font-medium"
            />
          </span>
          <span className="text-white/55">
            Net:{' '}
            <CurrencyText
              minor={filteredTotals.income - filteredTotals.expenses}
              currency={primaryCurrency}
              locale={state.preferences.locale}
              showPlus
              className="text-white font-semibold"
            />
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <GlassCard className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-2 relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search transactions"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search description, merchant, tag, or note..."
              className="w-full finora-input pl-9 pr-3 py-2 text-xs"
            />
          </div>

          <select
            aria-label="Filter by transaction type"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as 'all' | TransactionType);
              setPage(1);
            }}
            className="finora-input px-3 py-2 text-xs"
          >
            <option value="all">All Types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="refund">Refund</option>
            <option value="adjustment">Adjustment</option>
          </select>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="finora-input px-3 py-2 text-xs"
          >
            <option value="all">All Categories</option>
            <option value="uncategorized">Uncategorized</option>
            {state.categories
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.kind})
                </option>
              ))}
          </select>

          <select
            aria-label="Filter by account"
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(1);
            }}
            className="finora-input px-3 py-2 text-xs"
          >
            <option value="all">All Accounts</option>
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="date"
              aria-label="Start date filter"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="finora-input px-2.5 py-1.5 text-xs font-mono-num"
            />
            <span className="text-white/40">to</span>
            <input
              type="date"
              aria-label="End date filter"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="finora-input px-2.5 py-1.5 text-xs font-mono-num"
            />
            {(search || typeFilter !== 'all' || categoryFilter !== 'all' || accountFilter !== 'all' || startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setTypeFilter('all');
                  setCategoryFilter('all');
                  setAccountFilter('all');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="text-xs text-white/65 hover:text-white underline ml-1"
              >
                Reset filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/45">{filtered.length} matching</span>
            <select
              aria-label="Sort transactions"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="finora-input px-2.5 py-1.5 text-xs"
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="amount-desc">Highest amount</option>
              <option value="amount-asc">Lowest amount</option>
            </select>
          </div>
        </div>

        {/* Bulk Categorization Bar */}
        {selectedIds.length > 0 && (
          <div className="pt-3 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-white">
              {selectedIds.length} transaction{selectedIds.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <select
                aria-label="Bulk assign category"
                value={bulkCatId}
                onChange={(e) => setBulkCatId(e.target.value)}
                className="finora-input px-2.5 py-1.5 text-xs"
              >
                <option value="">Uncategorized</option>
                {state.categories
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={applyBulkCategorize}
                className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 whitespace-nowrap"
              >
                Apply Category
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {filtered.length === 0 ? (
        <EmptyState
          title="No transactions match these filters"
          description="Record a new transaction or clear your active search and date filters."
          actionLabel="Record Transaction"
          onAction={() => {
            setEditingTx(null);
            setModalOpen(true);
          }}
        />
      ) : (
        <GlassCard variant="table" className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-white/50">
                  <th className="py-3 pl-5 pr-2 w-9">
                    <button
                      type="button"
                      onClick={toggleSelectAllOnPage}
                      aria-label="Select all transactions on page"
                      className="text-white/60 hover:text-white"
                    >
                      {pageItems.length > 0 && pageItems.every((i) => selectedIds.includes(i.id)) ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 font-medium">Date</th>
                  <th className="py-3 px-3 font-medium">Description &amp; Merchant</th>
                  <th className="py-3 px-3 font-medium">Category</th>
                  <th className="py-3 px-3 font-medium">Account</th>
                  <th className="py-3 px-3 font-medium text-right">Amount</th>
                  <th className="py-3 pl-3 pr-5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {pageItems.map((tx) => {
                  const catName =
                    tx.type === 'transfer'
                      ? 'Internal Transfer'
                      : tx.type === 'adjustment'
                      ? 'Balance Adjustment'
                      : state.categories.find((c) => c.id === tx.categoryId)?.name ?? 'Uncategorized';
                  const acc = state.accounts.find((a) => a.id === tx.accountId);
                  const toAcc = tx.toAccountId
                    ? state.accounts.find((a) => a.id === tx.toAccountId)
                    : null;
                  const signedMinor =
                    tx.type === 'expense' || (tx.type === 'adjustment' && tx.adjustmentDirection === 'debit')
                      ? -tx.amountMinor
                      : tx.amountMinor;

                  return (
                    <tr key={tx.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 pl-5 pr-2">
                        <button
                          type="button"
                          onClick={() => toggleSelect(tx.id)}
                          aria-label={`Select ${tx.description}`}
                          className="text-white/55 hover:text-white"
                        >
                          {selectedIds.includes(tx.id) ? (
                            <CheckSquare className="w-4 h-4 text-white" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono-num text-white/70 whitespace-nowrap">
                        {formatDisplayDate(tx.date, state.preferences.dateFormat, state.preferences.locale)}
                      </td>
                      <td className="py-3 px-3 min-w-[200px]">
                        <div className="flex items-center gap-1.5 text-white font-medium">
                          <span className="truncate max-w-[240px]">{tx.description}</span>
                          {tx.receipt && (
                            <Paperclip className="w-3 h-3 text-white/50 shrink-0" aria-label="Has receipt" />
                          )}
                        </div>
                        <div className="text-white/45 mt-0.5 truncate">
                          {tx.merchant || tx.paymentMethod}
                          {tx.status === 'scheduled' && ' · Scheduled'}
                          {tx.type === 'refund' && ' · Refund'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-white/70 whitespace-nowrap">{catName}</td>
                      <td className="py-3 px-3 text-white/70 whitespace-nowrap">
                        {acc?.name ?? 'Unknown'}
                        {toAcc ? ` → ${toAcc.name}` : ''}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <CurrencyText
                          minor={signedMinor}
                          currency={tx.currency}
                          locale={state.preferences.locale}
                          showPlus={tx.type === 'income' || tx.type === 'refund'}
                          className={
                            tx.type === 'income' || tx.type === 'refund'
                              ? 'text-emerald-400 font-medium'
                              : tx.type === 'transfer'
                              ? 'text-white/75'
                              : 'text-white font-medium'
                          }
                        />
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailTx(tx)}
                            aria-label={`Inspect ${tx.description}`}
                            className="w-7 h-7 rounded-lg glass-interactive inline-flex items-center justify-center text-white/65 hover:text-white"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTx(tx);
                              setModalOpen(true);
                            }}
                            aria-label={`Edit ${tx.description}`}
                            className="w-7 h-7 rounded-lg glass-interactive inline-flex items-center justify-center text-white/65 hover:text-white"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateTransaction(tx.id)}
                            aria-label={`Duplicate ${tx.description}`}
                            className="w-7 h-7 rounded-lg glass-interactive inline-flex items-center justify-center text-white/65 hover:text-white"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(tx)}
                            aria-label={`Delete ${tx.description}`}
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

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-white/60">
              <span>
                Page {safePage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="glass-interactive px-3 py-1 rounded-lg disabled:opacity-35"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="glass-interactive px-3 py-1 rounded-lg disabled:opacity-35"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* Add / Edit Transaction Modal */}
      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTx(null);
        }}
        editingTransaction={editingTx}
      />

      {/* Transaction Details Modal */}
      <GlassModal
        open={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
        title={detailTx?.description || 'Transaction Details'}
        subtitle={detailTx ? `${detailTx.type.toUpperCase()} · ${detailTx.date}` : ''}
      >
        {detailTx && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3">
                <div className="text-white/50">Amount</div>
                <div className="text-lg font-semibold text-white mt-1">
                  <CurrencyText minor={detailTx.amountMinor} currency={detailTx.currency} locale={state.preferences.locale} />
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3">
                <div className="text-white/50">Status &amp; Method</div>
                <div className="text-sm font-medium text-white mt-1">
                  {detailTx.status} · {detailTx.paymentMethod}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-white/75">
              <div>
                <span className="text-white/45">Merchant / Source:</span> {detailTx.merchant || '—'}
              </div>
              <div>
                <span className="text-white/45">Tags:</span>{' '}
                {detailTx.tags.length > 0 ? detailTx.tags.join(', ') : '—'}
              </div>
              <div>
                <span className="text-white/45">Notes:</span> {detailTx.notes || '—'}
              </div>
            </div>

            {detailTx.receipt && (
              <div className="pt-3 border-t border-white/[0.08]">
                <div className="text-white/60 mb-2">Attached Receipt ({detailTx.receipt.name})</div>
                {detailTx.receipt.mimeType.startsWith('image/') ? (
                  <img
                    src={detailTx.receipt.dataUrl}
                    alt={detailTx.receipt.name}
                    className="max-h-64 rounded-xl border border-white/[0.1] object-contain"
                  />
                ) : (
                  <a
                    href={detailTx.receipt.dataUrl}
                    download={detailTx.receipt.name}
                    className="glass-interactive px-3 py-2 rounded-xl inline-block text-white"
                  >
                    Download {detailTx.receipt.name}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </GlassModal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteTransaction(deleteTarget.id);
        }}
        title="Delete Transaction"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.description}" (${deleteTarget.date})? Affected account balances and budget totals will immediately recalculate.`
            : ''
        }
        confirmLabel="Delete Transaction"
      />
    </div>
  );
};

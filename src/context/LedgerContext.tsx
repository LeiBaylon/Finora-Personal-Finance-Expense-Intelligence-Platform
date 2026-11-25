import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { computeNextOccurrenceDate, resolveDateRange } from '../core/accounting';
import { createEmptyLedgerState, createSampleLedgerState } from '../core/seedData';
import type {
  Account,
  ActivityLogEntry,
  Bill,
  Budget,
  Category,
  CurrencyCode,
  DateRange,
  DateRangePreset,
  ExchangeRateEntry,
  FinoraLedgerState,
  GoalTransaction,
  RecurringRule,
  SavingsGoal,
  Subscription,
  Transaction,
  UserPreferences,
  WorkspaceId,
} from '../core/types';

export interface ToastNotification {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface AuthStatus {
  checked: boolean;
  hasPasscode: boolean;
  authenticated: boolean;
}

interface LedgerContextValue {
  state: FinoraLedgerState | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  auth: AuthStatus;
  activeWorkspace: WorkspaceId;
  setActiveWorkspace: (id: WorkspaceId) => void;
  dateRange: DateRange;
  setDateRangePreset: (preset: DateRangePreset, customStart?: string, customEnd?: string) => void;
  referenceDate: string;
  toasts: ToastNotification[];
  notify: (message: string, tone?: ToastNotification['tone']) => void;
  dismissToast: (id: string) => void;

  // Auth actions
  unlockWorkspace: (passcode: string) => Promise<boolean>;
  configurePasscode: (currentPasscode: string, newPasscode: string) => Promise<{ ok: boolean; error?: string }>;
  lockWorkspace: () => Promise<void>;

  // Domain mutations
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Transaction;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  duplicateTransaction: (id: string) => void;
  bulkCategorizeTransactions: (ids: string[], categoryId: string | null) => void;

  addAccount: (acc: Omit<Account, 'id' | 'createdAt'>) => Account;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  adjustAccountOpeningBalance: (id: string, newOpeningBalanceMinor: number, reason: string) => void;
  archiveAccount: (id: string, archived: boolean) => void;

  addCategory: (cat: Omit<Category, 'id'>) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  archiveCategory: (id: string, archived: boolean) => void;

  addBudget: (b: Omit<Budget, 'id'>) => void;
  updateBudget: (id: string, patch: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;

  addSavingsGoal: (g: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;
  updateSavingsGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  deleteSavingsGoal: (id: string) => void;
  recordGoalEntry: (entry: {
    goalId: string;
    kind: 'contribution' | 'withdrawal';
    amountMinor: number;
    date: string;
    sourceAccountId: string;
    note: string;
    createAccountTransfer: boolean;
  }) => void;

  addBill: (b: Omit<Bill, 'id'>) => void;
  updateBill: (id: string, patch: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  markBillPaid: (billId: string, paidAmountMinor?: number, paidDate?: string) => void;

  addSubscription: (s: Omit<Subscription, 'id' | 'history'>) => void;
  updateSubscription: (id: string, patch: Partial<Subscription>) => void;
  deleteSubscription: (id: string) => void;

  addRecurringRule: (r: Omit<RecurringRule, 'id'>) => void;
  updateRecurringRule: (id: string, patch: Partial<RecurringRule>) => void;
  deleteRecurringRule: (id: string) => void;
  recordRecurringOccurrenceNow: (ruleId: string) => void;

  updatePreferences: (patch: Partial<UserPreferences>) => void;
  upsertFxRates: (rates: ExchangeRateEntry[]) => void;
  importTransactionsConfirmed: (
    rows: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>,
    summaryLabel: string
  ) => void;
  restoreBackup: (backup: FinoraLedgerState) => void;
  clearSampleDataAndStartFresh: () => void;
  loadSampleData: () => void;
  deleteAllWorkspaceData: () => Promise<void>;
  getAuthHeaders: () => Record<string, string>;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const referenceDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [state, setState] = useState<FinoraLedgerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthStatus>({
    checked: false,
    hasPasscode: false,
    authenticated: true,
  });

  // Session Bearer token held strictly in JS memory (never localStorage)
  const tokenRef = useRef<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('dashboard');
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    resolveDateRange('this-month', referenceDate)
  );
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const notify = useCallback((message: string, tone: ToastNotification['tone'] = 'info') => {
    const id = makeId('toast');
    setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    return tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {};
  }, []);

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authRes = await fetch('/api/auth/status', { headers: getAuthHeaders() });
      const authJson = (await authRes.json()) as { hasPasscode: boolean; authenticated: boolean };
      setAuth({
        checked: true,
        hasPasscode: authJson.hasPasscode,
        authenticated: authJson.authenticated,
      });

      if (!authJson.authenticated) {
        setLoading(false);
        return;
      }

      const res = await fetch('/api/workspace', { headers: getAuthHeaders() });
      if (!res.ok) {
        throw new Error(`Failed to load workspace (HTTP ${res.status})`);
      }
      const data = (await res.json()) as FinoraLedgerState;
      setState(data);
      setDateRange(resolveDateRange(data.preferences.defaultDatePreset, referenceDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Finora ledger.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, referenceDate]);

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  const persistState = useCallback(
    async (next: FinoraLedgerState) => {
      setSaving(true);
      try {
        const res = await fetch('/api/workspace', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify(next),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || `Save failed (HTTP ${res.status})`);
        }
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Failed to save changes.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [getAuthHeaders, notify]
  );

  const mutateState = useCallback(
    (
      updater: (prev: FinoraLedgerState) => FinoraLedgerState,
      activity?: Omit<ActivityLogEntry, 'id' | 'timestamp'>
    ) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        const now = new Date().toISOString();
        const enriched: FinoraLedgerState = {
          ...next,
          lastUpdated: now,
          activityLog: activity
            ? [
                {
                  id: makeId('act'),
                  timestamp: now,
                  ...activity,
                },
                ...next.activityLog,
              ].slice(0, 300)
            : next.activityLog,
        };
        void persistState(enriched);
        return enriched;
      });
    },
    [persistState]
  );

  const setDateRangePreset = useCallback(
    (preset: DateRangePreset, customStart?: string, customEnd?: string) => {
      setDateRange(resolveDateRange(preset, referenceDate, customStart, customEnd));
    },
    [referenceDate]
  );

  const unlockWorkspace = useCallback(
    async (passcode: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { token: string };
        tokenRef.current = data.token;
        await fetchWorkspace();
        return true;
      } catch {
        return false;
      }
    },
    [fetchWorkspace]
  );

  const configurePasscode = useCallback(
    async (currentPasscode: string, newPasscode: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ currentPasscode, newPasscode }),
        });
        const data = (await res.json()) as { hasPasscode?: boolean; token?: string | null; error?: string };
        if (!res.ok) {
          return { ok: false, error: data.error || 'Failed to update passcode.' };
        }
        tokenRef.current = data.token ?? null;
        setAuth({ checked: true, hasPasscode: Boolean(data.hasPasscode), authenticated: true });
        notify(
          data.hasPasscode ? 'Workspace passcode protection enabled.' : 'Workspace passcode removed.',
          'success'
        );
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Request failed.' };
      }
    },
    [getAuthHeaders, notify]
  );

  const lockWorkspace = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
    tokenRef.current = null;
    setState(null);
    setAuth((prev) => ({ ...prev, authenticated: false }));
  }, [getAuthHeaders]);

  // Transactions
  const addTransaction = useCallback(
    (txInput: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction => {
      const now = new Date().toISOString();
      const created: Transaction = {
        ...txInput,
        id: makeId('tx'),
        createdAt: now,
        updatedAt: now,
      };
      mutateState(
        (prev) => ({ ...prev, transactions: [created, ...prev.transactions] }),
        {
          action: `Recorded ${created.type}`,
          entityType: 'transaction',
          entityId: created.id,
          summary: `${created.description} (${created.currency})`,
        }
      );
      notify('Transaction recorded.', 'success');
      return created;
    },
    [mutateState, notify]
  );

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      mutateState(
        (prev) => ({
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
          ),
        }),
        {
          action: 'Updated Transaction',
          entityType: 'transaction',
          entityId: id,
          summary: patch.description || 'Modified transaction record',
        }
      );
      notify('Transaction updated.', 'success');
    },
    [mutateState, notify]
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      mutateState(
        (prev) => ({
          ...prev,
          transactions: prev.transactions.filter((t) => t.id !== id),
        }),
        {
          action: 'Deleted Transaction',
          entityType: 'transaction',
          entityId: id,
          summary: 'Removed transaction and reconciled affected account balances.',
        }
      );
      notify('Transaction deleted.', 'info');
    },
    [mutateState, notify]
  );

  const duplicateTransaction = useCallback(
    (id: string) => {
      if (!state) return;
      const orig = state.transactions.find((t) => t.id === id);
      if (!orig) return;
      const now = new Date().toISOString();
      const copy: Transaction = {
        ...orig,
        id: makeId('tx'),
        date: referenceDate,
        description: `${orig.description} (Copy)`,
        createdAt: now,
        updatedAt: now,
      };
      mutateState(
        (prev) => ({ ...prev, transactions: [copy, ...prev.transactions] }),
        {
          action: 'Duplicated Transaction',
          entityType: 'transaction',
          entityId: copy.id,
          summary: copy.description,
        }
      );
      notify('Transaction duplicated to today.', 'success');
    },
    [mutateState, notify, referenceDate, state]
  );

  const bulkCategorizeTransactions = useCallback(
    (ids: string[], categoryId: string | null) => {
      const idSet = new Set(ids);
      mutateState(
        (prev) => ({
          ...prev,
          transactions: prev.transactions.map((t) =>
            idSet.has(t.id) ? { ...t, categoryId, updatedAt: new Date().toISOString() } : t
          ),
        }),
        {
          action: 'Bulk Categorized',
          entityType: 'transaction',
          entityId: 'bulk',
          summary: `Assigned category to ${ids.length} transactions.`,
        }
      );
      notify(`Updated category on ${ids.length} transactions.`, 'success');
    },
    [mutateState, notify]
  );

  // Accounts
  const addAccount = useCallback(
    (accInput: Omit<Account, 'id' | 'createdAt'>): Account => {
      const created: Account = {
        ...accInput,
        id: makeId('acc'),
        createdAt: new Date().toISOString(),
      };
      mutateState(
        (prev) => ({ ...prev, accounts: [...prev.accounts, created] }),
        {
          action: 'Created Account',
          entityType: 'account',
          entityId: created.id,
          summary: `${created.name} (${created.currency})`,
        }
      );
      notify(`Account "${created.name}" created.`, 'success');
      return created;
    },
    [mutateState, notify]
  );

  const updateAccount = useCallback(
    (id: string, patch: Partial<Account>) => {
      mutateState(
        (prev) => ({
          ...prev,
          accounts: prev.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }),
        {
          action: 'Updated Account',
          entityType: 'account',
          entityId: id,
          summary: patch.name || 'Updated account settings',
        }
      );
      notify('Account settings saved.', 'success');
    },
    [mutateState, notify]
  );

  const adjustAccountOpeningBalance = useCallback(
    (id: string, newOpeningBalanceMinor: number, reason: string) => {
      mutateState(
        (prev) => ({
          ...prev,
          accounts: prev.accounts.map((a) =>
            a.id === id ? { ...a, openingBalanceMinor: newOpeningBalanceMinor } : a
          ),
        }),
        {
          action: 'Opening Balance Adjusted',
          entityType: 'account',
          entityId: id,
          summary: reason || 'Manual opening balance adjustment recorded.',
        }
      );
      notify('Opening balance updated with activity record.', 'success');
    },
    [mutateState, notify]
  );

  const archiveAccount = useCallback(
    (id: string, archived: boolean) => {
      mutateState(
        (prev) => ({
          ...prev,
          accounts: prev.accounts.map((a) => (a.id === id ? { ...a, archived } : a)),
        }),
        {
          action: archived ? 'Archived Account' : 'Restored Account',
          entityType: 'account',
          entityId: id,
          summary: archived ? 'Account archived from active totals.' : 'Account restored.',
        }
      );
      notify(archived ? 'Account archived.' : 'Account restored.', 'info');
    },
    [mutateState, notify]
  );

  // Categories
  const addCategory = useCallback(
    (catInput: Omit<Category, 'id'>): Category => {
      const created: Category = { ...catInput, id: makeId('cat') };
      mutateState(
        (prev) => ({ ...prev, categories: [...prev.categories, created] }),
        {
          action: 'Created Category',
          entityType: 'category',
          entityId: created.id,
          summary: `${created.name} (${created.kind})`,
        }
      );
      notify(`Category "${created.name}" added.`, 'success');
      return created;
    },
    [mutateState, notify]
  );

  const updateCategory = useCallback(
    (id: string, patch: Partial<Category>) => {
      mutateState(
        (prev) => ({
          ...prev,
          categories: prev.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }),
        {
          action: 'Updated Category',
          entityType: 'category',
          entityId: id,
          summary: patch.name || 'Modified category',
        }
      );
    },
    [mutateState]
  );

  const archiveCategory = useCallback(
    (id: string, archived: boolean) => {
      mutateState(
        (prev) => ({
          ...prev,
          categories: prev.categories.map((c) => (c.id === id ? { ...c, archived } : c)),
        }),
        {
          action: archived ? 'Archived Category' : 'Restored Category',
          entityType: 'category',
          entityId: id,
          summary: archived ? 'Category archived.' : 'Category restored.',
        }
      );
    },
    [mutateState]
  );

  // Budgets
  const addBudget = useCallback(
    (b: Omit<Budget, 'id'>) => {
      const created: Budget = { ...b, id: makeId('bud') };
      mutateState(
        (prev) => ({ ...prev, budgets: [...prev.budgets, created] }),
        {
          action: 'Created Budget',
          entityType: 'budget',
          entityId: created.id,
          summary: `${created.name} (${created.period})`,
        }
      );
      notify(`Budget "${created.name}" created.`, 'success');
    },
    [mutateState, notify]
  );

  const updateBudget = useCallback(
    (id: string, patch: Partial<Budget>) => {
      mutateState(
        (prev) => ({
          ...prev,
          budgets: prev.budgets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }),
        {
          action: 'Updated Budget',
          entityType: 'budget',
          entityId: id,
          summary: patch.name || 'Updated budget settings',
        }
      );
      notify('Budget updated.', 'success');
    },
    [mutateState, notify]
  );

  const deleteBudget = useCallback(
    (id: string) => {
      mutateState(
        (prev) => ({ ...prev, budgets: prev.budgets.filter((b) => b.id !== id) }),
        {
          action: 'Deleted Budget',
          entityType: 'budget',
          entityId: id,
          summary: 'Removed budget plan.',
        }
      );
      notify('Budget removed.', 'info');
    },
    [mutateState, notify]
  );

  // Savings Goals
  const addSavingsGoal = useCallback(
    (g: Omit<SavingsGoal, 'id' | 'createdAt'>) => {
      const created: SavingsGoal = { ...g, id: makeId('goal'), createdAt: new Date().toISOString() };
      mutateState(
        (prev) => ({ ...prev, savingsGoals: [...prev.savingsGoals, created] }),
        {
          action: 'Created Savings Goal',
          entityType: 'goal',
          entityId: created.id,
          summary: created.name,
        }
      );
      notify(`Savings goal "${created.name}" created.`, 'success');
    },
    [mutateState, notify]
  );

  const updateSavingsGoal = useCallback(
    (id: string, patch: Partial<SavingsGoal>) => {
      mutateState(
        (prev) => ({
          ...prev,
          savingsGoals: prev.savingsGoals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        }),
        {
          action: 'Updated Savings Goal',
          entityType: 'goal',
          entityId: id,
          summary: patch.name || 'Updated goal parameters',
        }
      );
      notify('Savings goal updated.', 'success');
    },
    [mutateState, notify]
  );

  const deleteSavingsGoal = useCallback(
    (id: string) => {
      mutateState(
        (prev) => ({
          ...prev,
          savingsGoals: prev.savingsGoals.filter((g) => g.id !== id),
          goalTransactions: prev.goalTransactions.filter((gt) => gt.goalId !== id),
        }),
        {
          action: 'Deleted Savings Goal',
          entityType: 'goal',
          entityId: id,
          summary: 'Removed savings goal.',
        }
      );
      notify('Savings goal deleted.', 'info');
    },
    [mutateState, notify]
  );

  const recordGoalEntry = useCallback(
    (entry: {
      goalId: string;
      kind: 'contribution' | 'withdrawal';
      amountMinor: number;
      date: string;
      sourceAccountId: string;
      note: string;
      createAccountTransfer: boolean;
    }) => {
      if (!state) return;
      const goal = state.savingsGoals.find((g) => g.id === entry.goalId);
      if (!goal) return;
      const now = new Date().toISOString();

      let linkedTransfer: Transaction | null = null;
      if (entry.createAccountTransfer && entry.sourceAccountId !== goal.accountId) {
        const fromId = entry.kind === 'contribution' ? entry.sourceAccountId : goal.accountId;
        const toId = entry.kind === 'contribution' ? goal.accountId : entry.sourceAccountId;
        linkedTransfer = {
          id: makeId('tx'),
          type: 'transfer',
          description:
            entry.kind === 'contribution'
              ? `Savings Contribution: ${goal.name}`
              : `Savings Withdrawal: ${goal.name}`,
          amountMinor: entry.amountMinor,
          currency: goal.currency,
          date: entry.date,
          categoryId: null,
          accountId: fromId,
          toAccountId: toId,
          paymentMethod: 'Internal Transfer',
          merchant: goal.name,
          notes: entry.note,
          tags: ['savings-goal'],
          savingsGoalId: goal.id,
          status: 'completed',
          createdAt: now,
          updatedAt: now,
        };
      }

      const gt: GoalTransaction = {
        id: makeId('gt'),
        goalId: goal.id,
        kind: entry.kind,
        amountMinor: entry.amountMinor,
        currency: goal.currency,
        date: entry.date,
        sourceAccountId: entry.sourceAccountId,
        linkedTransferId: linkedTransfer?.id ?? null,
        note: entry.note,
        createdAt: now,
      };

      mutateState(
        (prev) => ({
          ...prev,
          goalTransactions: [gt, ...prev.goalTransactions],
          transactions: linkedTransfer ? [linkedTransfer, ...prev.transactions] : prev.transactions,
        }),
        {
          action: entry.kind === 'contribution' ? 'Goal Contribution' : 'Goal Withdrawal',
          entityType: 'goal',
          entityId: goal.id,
          summary: `${goal.name}${linkedTransfer ? ' (with internal account transfer)' : ''}`,
        }
      );
      notify(
        entry.kind === 'contribution' ? 'Savings contribution recorded.' : 'Savings withdrawal recorded.',
        'success'
      );
    },
    [mutateState, notify, state]
  );

  // Bills
  const addBill = useCallback(
    (b: Omit<Bill, 'id'>) => {
      const created: Bill = { ...b, id: makeId('bill') };
      mutateState(
        (prev) => ({ ...prev, bills: [...prev.bills, created] }),
        { action: 'Added Bill', entityType: 'bill', entityId: created.id, summary: created.name }
      );
      notify(`Bill "${created.name}" added.`, 'success');
    },
    [mutateState, notify]
  );

  const updateBill = useCallback(
    (id: string, patch: Partial<Bill>) => {
      mutateState(
        (prev) => ({
          ...prev,
          bills: prev.bills.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }),
        { action: 'Updated Bill', entityType: 'bill', entityId: id, summary: patch.name || 'Updated bill' }
      );
    },
    [mutateState]
  );

  const deleteBill = useCallback(
    (id: string) => {
      mutateState(
        (prev) => ({ ...prev, bills: prev.bills.filter((b) => b.id !== id) }),
        { action: 'Deleted Bill', entityType: 'bill', entityId: id, summary: 'Removed bill.' }
      );
      notify('Bill removed.', 'info');
    },
    [mutateState, notify]
  );

  const markBillPaid = useCallback(
    (billId: string, paidAmountMinor?: number, paidDate?: string) => {
      if (!state) return;
      const bill = state.bills.find((b) => b.id === billId);
      if (!bill) return;
      const now = new Date().toISOString();
      const dateUsed = paidDate || referenceDate;
      const amountUsed = paidAmountMinor ?? bill.amountMinor;

      const tx: Transaction = {
        id: makeId('tx'),
        type: 'expense',
        description: `Bill Payment: ${bill.name}`,
        amountMinor: amountUsed,
        currency: bill.currency,
        date: dateUsed,
        categoryId: bill.categoryId,
        accountId: bill.accountId,
        paymentMethod: 'Bill Payment',
        merchant: bill.name,
        notes: bill.isEstimated ? 'Actual payment recorded from estimated bill' : bill.notes,
        tags: ['bill'],
        billId: bill.id,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      };

      mutateState(
        (prev) => ({
          ...prev,
          transactions: [tx, ...prev.transactions],
          bills: prev.bills.map((b) =>
            b.id === bill.id
              ? {
                  ...b,
                  status: 'paid',
                  isEstimated: false,
                  amountMinor: amountUsed,
                  lastPaidDate: dateUsed,
                }
              : b
          ),
        }),
        {
          action: 'Paid Bill',
          entityType: 'bill',
          entityId: bill.id,
          summary: `Recorded actual expense payment for ${bill.name}.`,
        }
      );
      notify(`Recorded payment for "${bill.name}".`, 'success');
    },
    [mutateState, notify, referenceDate, state]
  );

  // Subscriptions
  const addSubscription = useCallback(
    (s: Omit<Subscription, 'id' | 'history'>) => {
      const created: Subscription = { ...s, id: makeId('sub'), history: [] };
      mutateState(
        (prev) => ({ ...prev, subscriptions: [...prev.subscriptions, created] }),
        {
          action: 'Added Subscription',
          entityType: 'subscription',
          entityId: created.id,
          summary: created.name,
        }
      );
      notify(`Subscription "${created.name}" added.`, 'success');
    },
    [mutateState, notify]
  );

  const updateSubscription = useCallback(
    (id: string, patch: Partial<Subscription>) => {
      mutateState(
        (prev) => ({
          ...prev,
          subscriptions: prev.subscriptions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        }),
        {
          action: 'Updated Subscription',
          entityType: 'subscription',
          entityId: id,
          summary: patch.name || 'Updated subscription status/details',
        }
      );
      notify('Subscription updated.', 'success');
    },
    [mutateState, notify]
  );

  const deleteSubscription = useCallback(
    (id: string) => {
      mutateState(
        (prev) => ({ ...prev, subscriptions: prev.subscriptions.filter((s) => s.id !== id) }),
        {
          action: 'Deleted Subscription',
          entityType: 'subscription',
          entityId: id,
          summary: 'Removed subscription.',
        }
      );
      notify('Subscription removed.', 'info');
    },
    [mutateState, notify]
  );

  // Recurring Rules
  const addRecurringRule = useCallback(
    (r: Omit<RecurringRule, 'id'>) => {
      const created: RecurringRule = { ...r, id: makeId('rec') };
      mutateState(
        (prev) => ({ ...prev, recurringRules: [...prev.recurringRules, created] }),
        {
          action: 'Added Recurring Rule',
          entityType: 'recurring',
          entityId: created.id,
          summary: `${created.title} (${created.frequency})`,
        }
      );
      notify(`Recurring schedule "${created.title}" created.`, 'success');
    },
    [mutateState, notify]
  );

  const updateRecurringRule = useCallback(
    (id: string, patch: Partial<RecurringRule>) => {
      mutateState(
        (prev) => ({
          ...prev,
          recurringRules: prev.recurringRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }),
        {
          action: 'Updated Recurring Rule',
          entityType: 'recurring',
          entityId: id,
          summary: patch.title || 'Modified recurring rule',
        }
      );
    },
    [mutateState]
  );

  const deleteRecurringRule = useCallback(
    (id: string) => {
      mutateState(
        (prev) => ({ ...prev, recurringRules: prev.recurringRules.filter((r) => r.id !== id) }),
        {
          action: 'Deleted Recurring Rule',
          entityType: 'recurring',
          entityId: id,
          summary: 'Removed recurring schedule.',
        }
      );
      notify('Recurring rule deleted.', 'info');
    },
    [mutateState, notify]
  );

  const recordRecurringOccurrenceNow = useCallback(
    (ruleId: string) => {
      if (!state) return;
      const rule = state.recurringRules.find((r) => r.id === ruleId);
      if (!rule) return;
      const now = new Date().toISOString();
      const tx: Transaction = {
        id: makeId('tx'),
        type: rule.type,
        description: rule.title,
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        date: rule.nextOccurrenceDate,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        toAccountId: rule.toAccountId ?? null,
        paymentMethod: rule.paymentMethod,
        merchant: rule.merchant,
        notes: rule.notes,
        tags: ['recurring'],
        recurrenceId: rule.id,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      };
      const nextDate = computeNextOccurrenceDate(
        rule.nextOccurrenceDate,
        rule.frequency,
        rule.customIntervalDays
      );

      mutateState(
        (prev) => ({
          ...prev,
          transactions: [tx, ...prev.transactions],
          recurringRules: prev.recurringRules.map((r) =>
            r.id === rule.id ? { ...r, nextOccurrenceDate: nextDate } : r
          ),
        }),
        {
          action: 'Recorded Recurring Occurrence',
          entityType: 'recurring',
          entityId: rule.id,
          summary: `${rule.title} on ${tx.date} (next: ${nextDate})`,
        }
      );
      notify(`Recorded "${rule.title}" and advanced next occurrence to ${nextDate}.`, 'success');
    },
    [mutateState, notify, state]
  );

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      mutateState(
        (prev) => ({
          ...prev,
          preferences: { ...prev.preferences, ...patch },
        }),
        {
          action: 'Updated Preferences',
          entityType: 'settings',
          entityId: 'preferences',
          summary: 'Updated display, currency, or dashboard configuration.',
        }
      );
      notify('Preferences saved.', 'success');
    },
    [mutateState, notify]
  );

  const upsertFxRates = useCallback(
    (rates: ExchangeRateEntry[]) => {
      mutateState(
        (prev) => {
          const map = new Map<string, ExchangeRateEntry>();
          for (const existing of prev.fxRates) {
            map.set(`${existing.base}->${existing.quote}`, existing);
          }
          for (const incoming of rates) {
            map.set(`${incoming.base}->${incoming.quote}`, incoming);
          }
          return { ...prev, fxRates: Array.from(map.values()) };
        },
        {
          action: 'Updated FX Rates',
          entityType: 'settings',
          entityId: 'fx',
          summary: `Stored ${rates.length} exchange rate entries with explicit timestamps.`,
        }
      );
      notify(`Saved ${rates.length} exchange rates.`, 'success');
    },
    [mutateState, notify]
  );

  const importTransactionsConfirmed = useCallback(
    (rows: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>, summaryLabel: string) => {
      const now = new Date().toISOString();
      const created: Transaction[] = rows.map((r) => ({
        ...r,
        id: makeId('tx'),
        createdAt: now,
        updatedAt: now,
      }));
      mutateState(
        (prev) => ({
          ...prev,
          transactions: [...created, ...prev.transactions],
        }),
        {
          action: 'Imported Transactions',
          entityType: 'import',
          entityId: makeId('imp'),
          summary: `${summaryLabel} (${created.length} records)`,
        }
      );
      notify(`Imported ${created.length} transactions.`, 'success');
    },
    [mutateState, notify]
  );

  const restoreBackup = useCallback(
    (backup: FinoraLedgerState) => {
      mutateState(
        () => backup,
        {
          action: 'Restored Backup',
          entityType: 'system',
          entityId: 'backup',
          summary: `Restored ${backup.transactions.length} transactions and ${backup.accounts.length} accounts.`,
        }
      );
      notify('Workspace restored from backup.', 'success');
    },
    [mutateState, notify]
  );

  const clearSampleDataAndStartFresh = useCallback(() => {
    const primary: CurrencyCode = state?.preferences.primaryCurrency ?? 'USD';
    const empty = createEmptyLedgerState(primary);
    setState(empty);
    void persistState(empty);
    notify('Sample data cleared. Ready for your own financial records.', 'info');
  }, [notify, persistState, state?.preferences.primaryCurrency]);

  const loadSampleData = useCallback(() => {
    const sample = createSampleLedgerState(referenceDate);
    setState(sample);
    void persistState(sample);
    notify('Sample 3-month dataset loaded.', 'success');
  }, [notify, persistState, referenceDate]);

  const deleteAllWorkspaceData = useCallback(async () => {
    const primary: CurrencyCode = state?.preferences.primaryCurrency ?? 'USD';
    const res = await fetch(`/api/workspace?currency=${primary}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const fresh = (await res.json()) as FinoraLedgerState;
      setState(fresh);
      notify('All workspace records permanently deleted.', 'info');
    } else {
      notify('Failed to delete workspace data.', 'error');
    }
  }, [getAuthHeaders, notify, state?.preferences.primaryCurrency]);

  const value: LedgerContextValue = {
    state,
    loading,
    saving,
    error,
    auth,
    activeWorkspace,
    setActiveWorkspace,
    dateRange,
    setDateRangePreset,
    referenceDate,
    toasts,
    notify,
    dismissToast,
    unlockWorkspace,
    configurePasscode,
    lockWorkspace,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    duplicateTransaction,
    bulkCategorizeTransactions,
    addAccount,
    updateAccount,
    adjustAccountOpeningBalance,
    archiveAccount,
    addCategory,
    updateCategory,
    archiveCategory,
    addBudget,
    updateBudget,
    deleteBudget,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    recordGoalEntry,
    addBill,
    updateBill,
    deleteBill,
    markBillPaid,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    addRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    recordRecurringOccurrenceNow,
    updatePreferences,
    upsertFxRates,
    importTransactionsConfirmed,
    restoreBackup,
    clearSampleDataAndStartFresh,
    loadSampleData,
    deleteAllWorkspaceData,
    getAuthHeaders,
  };

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
};

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider');
  return ctx;
}

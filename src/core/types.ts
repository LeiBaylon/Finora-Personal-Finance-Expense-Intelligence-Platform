export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'CAD'
  | 'AUD'
  | 'CHF'
  | 'SGD'
  | 'PHP'
  | 'INR';

export type WorkspaceId =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'budgets'
  | 'savings-goals'
  | 'bills'
  | 'insights'
  | 'settings';

export type DateRangePreset =
  | 'today'
  | 'this-week'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface ExchangeRateEntry {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;        // 1 base = rate quote
  updatedAt: string;   // ISO timestamp
  source: string;      // e.g., 'ECB via Frankfurter' | 'Manual'
}

export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'credit_card'
  | 'e_wallet'
  | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  openingBalanceMinor: number; // integer minor units (e.g. cents)
  description: string;
  includeInTotal: boolean;
  archived: boolean;
  createdAt: string;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  group: string;
  isCustom: boolean;
  archived: boolean;
}

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'refund'
  | 'adjustment';

export type TransactionStatus = 'completed' | 'scheduled';

export interface ReceiptAttachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amountMinor: number; // Always positive integer minor units (except adjustment which uses signedAdjustment or adjustmentDirection; here amountMinor is signed ONLY for adjustment? Better: amountMinor >= 0, and adjustmentDirection?: 'credit' | 'debit' OR allow signed? Let's keep amountMinor >= 0 for income/expense/transfer/refund and adjustmentDirection: 'credit' | 'debit' defaulting to 'credit')
  adjustmentDirection?: 'credit' | 'debit';
  currency: CurrencyCode;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  categoryId: string | null;
  accountId: string;
  toAccountId?: string | null; // required when type === 'transfer'
  paymentMethod: string;
  merchant: string;
  notes: string;
  tags: string[];
  receipt?: ReceiptAttachment | null;
  recurrenceId?: string | null;
  billId?: string | null;
  subscriptionId?: string | null;
  savingsGoalId?: string | null;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
}

export type BudgetPeriod = 'weekly' | 'monthly' | 'custom';

export interface Budget {
  id: string;
  name: string;
  planName: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  categoryId: string | null; // null => overall spending budget
  amountMinor: number;
  currency: CurrencyCode;
  carryOver: boolean;
  previousCarryOverMinor: number;
  alertThresholdPct: number; // e.g., 80
  active: boolean;
}

export type ContributionSchedule = 'weekly' | 'biweekly' | 'monthly' | 'flexible';

export interface SavingsGoal {
  id: string;
  name: string;
  categoryLabel: string;
  targetAmountMinor: number;
  targetDate: string;
  contributionSchedule: ContributionSchedule;
  plannedContributionMinor: number;
  accountId: string; // Destination savings account
  currency: CurrencyCode;
  notes: string;
  createdAt: string;
}

export interface GoalTransaction {
  id: string;
  goalId: string;
  kind: 'contribution' | 'withdrawal';
  amountMinor: number;
  currency: CurrencyCode;
  date: string;
  sourceAccountId: string;
  linkedTransferId?: string | null;
  note: string;
  createdAt: string;
}

export type BillCategoryType =
  | 'utility'
  | 'rent'
  | 'internet'
  | 'phone'
  | 'loan'
  | 'insurance'
  | 'membership'
  | 'other';

export type RecurrenceFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom';

export interface Bill {
  id: string;
  name: string;
  billType: BillCategoryType;
  amountMinor: number;
  isEstimated: boolean;
  currency: CurrencyCode;
  dueDate: string;
  frequency: RecurrenceFrequency;
  accountId: string;
  categoryId: string | null;
  status: 'unpaid' | 'paid';
  reminderDaysBefore: number;
  lastPaidDate?: string | null;
  notes: string;
}

export interface Subscription {
  id: string;
  name: string;
  vendor: string;
  categoryLabel: string; // e.g. Streaming, Software, Cloud Storage, Membership, Gaming, Other
  amountMinor: number;
  currency: CurrencyCode;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextBillingDate: string;
  accountId: string;
  categoryId: string | null;
  status: 'active' | 'paused' | 'canceled';
  markedUnusedByUser: boolean;
  usageNote: string;
  notes: string;
  history: Array<{ date: string; amountMinor: number }>;
}

export interface RecurringRule {
  id: string;
  title: string;
  type: 'income' | 'expense' | 'transfer';
  amountMinor: number;
  currency: CurrencyCode;
  frequency: RecurrenceFrequency;
  customIntervalDays?: number;
  startDate: string;
  endDate?: string | null;
  nextOccurrenceDate: string;
  accountId: string;
  toAccountId?: string | null;
  categoryId: string | null;
  paymentMethod: string;
  merchant: string;
  active: boolean;
  notes: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: string;
  entityType:
    | 'transaction'
    | 'account'
    | 'category'
    | 'budget'
    | 'goal'
    | 'bill'
    | 'subscription'
    | 'recurring'
    | 'import'
    | 'export'
    | 'settings'
    | 'system';
  entityId: string;
  summary: string;
}

export type DashboardWidgetId =
  | 'kpis'
  | 'cashflow-chart'
  | 'category-distribution'
  | 'budget-utilization'
  | 'savings-progress'
  | 'upcoming-payments'
  | 'recent-transactions'
  | 'quick-insights';

export interface UserPreferences {
  primaryCurrency: CurrencyCode;
  locale: string;
  dateFormat: 'YYYY-MM-DD' | 'MMM D, YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  defaultDatePreset: DateRangePreset;
  dashboardWidgetOrder: DashboardWidgetId[];
  hiddenDashboardWidgets: DashboardWidgetId[];
  defaultBudgetAlertThresholdPct: number;
}

export interface FinoraLedgerState {
  version: number;
  isSampleData: boolean;
  lastUpdated: string;
  preferences: UserPreferences;
  fxRates: ExchangeRateEntry[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  goalTransactions: GoalTransaction[];
  bills: Bill[];
  subscriptions: Subscription[];
  recurringRules: RecurringRule[];
  activityLog: ActivityLogEntry[];
}

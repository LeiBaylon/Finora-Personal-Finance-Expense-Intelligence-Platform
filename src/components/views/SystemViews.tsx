import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  buildImportPreview,
  guessColumnMapping,
  parseCsvText,
  transactionsToCsv,
  validateBackupPayload,
  type ImportColumnMapping,
  type ParsedTable,
} from '../../core/importExport';
import { CURRENCY_LIST, formatMoney } from '../../core/money';
import type { CurrencyCode, DateRangePreset, ExchangeRateEntry, UserPreferences } from '../../core/types';
import { useLedger } from '../../context/LedgerContext';
import {
  ConfirmDialog,
  CurrencyText,
  GlassCard,
  SectionHeader,
  SegmentedControl,
} from '../ui/GlassPrimitives';

export const ImportExportView: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const {
    state,
    importTransactionsConfirmed,
    restoreBackup,
    notify,
  } = useLedger();

  const [parsedTable, setParsedTable] = useState<ParsedTable | null>(null);
  const [sourceFileName, setSourceFileName] = useState('');
  const [mapping, setMapping] = useState<ImportColumnMapping | null>(null);
  const [targetAccountId, setTargetAccountId] = useState('');
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});
  const [pasteCsv, setPasteCsv] = useState('');
  const [exportAccountId, setExportAccountId] = useState('all');

  const previewRows = useMemo(() => {
    if (!state || !parsedTable || !mapping) return [];
    const acc = state.accounts.find((a) => a.id === targetAccountId) ?? state.accounts[0];
    return buildImportPreview(
      parsedTable,
      mapping,
      acc?.id ?? '',
      acc?.currency ?? state.preferences.primaryCurrency,
      state.transactions,
      state.categories,
      categoryOverrides
    );
  }, [state, parsedTable, mapping, targetAccountId, categoryOverrides]);

  if (!state) return null;

  const activeAccounts = state.accounts.filter((a) => !a.archived);
  const effectiveAccountId = targetAccountId || activeAccounts[0]?.id || '';

  const initParsedTable = (table: ParsedTable, label: string) => {
    if (table.headers.length === 0 || table.rows.length === 0) {
      notify('No tabular rows found in the provided file.', 'warning');
      return;
    }
    const guessed = guessColumnMapping(table.headers);
    setParsedTable(table);
    setSourceFileName(label);
    setMapping(guessed);
    setTargetAccountId(activeAccounts[0]?.id ?? '');
    setSelectedRows({});
    setCategoryOverrides({});
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false });
      const cleanRows = rows
        .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []))
        .filter((r) => r.some(Boolean));
      if (cleanRows.length < 2) {
        notify('Spreadsheet must have a header row and at least one data row.', 'warning');
        return;
      }
      initParsedTable({ headers: cleanRows[0], rows: cleanRows.slice(1) }, file.name);
    } else {
      const text = await file.text();
      initParsedTable(parseCsvText(text), file.name);
    }
    e.target.value = '';
  };

  const handleParsePasted = () => {
    if (!pasteCsv.trim()) return;
    initParsedTable(parseCsvText(pasteCsv), 'Pasted CSV');
  };

  const isRowSelected = (idx: number, defaultSel: boolean) =>
    selectedRows[idx] !== undefined ? selectedRows[idx] : defaultSel;

  const rowsToImport = previewRows.filter((r) => r.valid && isRowSelected(r.rowIndex, r.selected));

  const handleConfirmImport = () => {
    if (rowsToImport.length === 0 || !effectiveAccountId) return;
    importTransactionsConfirmed(
      rowsToImport.map((r) => ({
        type: r.type,
        description: r.description,
        amountMinor: r.amountMinor,
        currency: r.currency,
        date: r.date,
        categoryId: r.categoryId,
        accountId: effectiveAccountId,
        paymentMethod: 'Imported Statement',
        merchant: r.merchant,
        notes: r.notes,
        tags: ['imported'],
        status: 'completed',
      })),
      `Imported from ${sourceFileName}`
    );
    setParsedTable(null);
    setMapping(null);
    setPasteCsv('');
  };

  const downloadFile = (content: BlobPart, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const txs =
      exportAccountId === 'all'
        ? state.transactions
        : state.transactions.filter(
            (t) => t.accountId === exportAccountId || t.toAccountId === exportAccountId
          );
    downloadFile(transactionsToCsv(txs, state), `finora-transactions-${exportAccountId}.csv`, 'text/csv;charset=utf-8');
    notify(`Exported ${txs.length} transactions to CSV.`, 'success');
  };

  const handleExportFullBackup = () => {
    downloadFile(
      JSON.stringify(state, null, 2),
      `finora-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
    notify('Full Finora backup exported.', 'success');
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateBackupPayload(parsed)) {
        notify('Invalid Finora backup file structure.', 'error');
        return;
      }
      restoreBackup(parsed);
    } catch {
      notify('Failed to parse JSON backup file.', 'error');
    }
    e.target.value = '';
  };

  const rawCategoriesInImport = Array.from(
    new Set(previewRows.map((r) => r.rawCategory).filter(Boolean))
  );

  return (
    <div className="space-y-6">
      {!embedded && (
        <SectionHeader
          title="Import & Export"
          subtitle="Import CSV or XLSX bank statements with column mapping, duplicate checks, and explicit confirmation—or export portable backups."
        />
      )}

      {/* Importer */}
      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Bank Statement &amp; Ledger Import</h2>
            <p className="text-xs text-white/50 mt-0.5">
              Supports CSV and XLSX files. Records are previewed and validated before anything is saved.
            </p>
          </div>
          <label className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            Choose CSV / XLSX
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>

        {!parsedTable && (
          <div className="space-y-2.5 pt-2 border-t border-white/[0.08]">
            <label htmlFor="paste-csv" className="block text-xs text-white/65">
              Or paste CSV rows directly
            </label>
            <textarea
              id="paste-csv"
              rows={4}
              value={pasteCsv}
              onChange={(e) => setPasteCsv(e.target.value)}
              placeholder={'Date,Description,Amount,Category\n2026-11-24,"Blue Bottle Coffee",-6.50,Dining Out'}
              className="w-full finora-input px-3 py-2 text-xs font-mono-num"
            />
            <button
              type="button"
              onClick={handleParsePasted}
              disabled={!pasteCsv.trim()}
              className="glass-interactive px-3.5 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-40"
            >
              Preview Pasted CSV
            </button>
          </div>
        )}

        {parsedTable && mapping && (
          <div className="space-y-4 pt-3 border-t border-white/[0.08]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white">
                Loaded <strong>{sourceFileName}</strong> ({parsedTable.rows.length} rows)
              </div>
              <button
                type="button"
                onClick={() => {
                  setParsedTable(null);
                  setMapping(null);
                }}
                className="text-xs text-white/60 hover:text-white underline"
              >
                Cancel Import
              </button>
            </div>

            {/* Column Mapping Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-white/55 mb-1">Target Account</label>
                <select
                  value={effectiveAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="w-full finora-input px-2.5 py-1.5 text-xs"
                >
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-white/55 mb-1">Date Column</label>
                <select
                  value={mapping.dateCol}
                  onChange={(e) => setMapping({ ...mapping, dateCol: Number(e.target.value) })}
                  className="w-full finora-input px-2.5 py-1.5 text-xs"
                >
                  {parsedTable.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white/55 mb-1">Description Column</label>
                <select
                  value={mapping.descriptionCol}
                  onChange={(e) => setMapping({ ...mapping, descriptionCol: Number(e.target.value) })}
                  className="w-full finora-input px-2.5 py-1.5 text-xs"
                >
                  {parsedTable.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white/55 mb-1">Amount Column</label>
                <select
                  value={mapping.amountCol}
                  onChange={(e) => setMapping({ ...mapping, amountCol: Number(e.target.value) })}
                  className="w-full finora-input px-2.5 py-1.5 text-xs"
                >
                  {parsedTable.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            </div>

            {/* Category mapping overrides */}
            {rawCategoriesInImport.length > 0 && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 space-y-2">
                <div className="text-xs font-medium text-white/75">Map Imported Categories</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {rawCategoriesInImport.map((rc) => (
                    <div key={rc} className="flex items-center gap-2 text-xs">
                      <span className="text-white/60 truncate w-28">{rc}</span>
                      <select
                        value={categoryOverrides[rc.toLowerCase()] ?? ''}
                        onChange={(e) =>
                          setCategoryOverrides((prev) => ({
                            ...prev,
                            [rc.toLowerCase()]: e.target.value,
                          }))
                        }
                        className="flex-1 finora-input px-2 py-1 text-xs"
                      >
                        <option value="">Auto / Uncategorized</option>
                        {state.categories.filter((c) => !c.archived).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview Table */}
            <div className="overflow-x-auto max-h-72 border border-white/[0.08] rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-white/50 bg-white/[0.02]">
                    <th className="py-2 px-3">Import</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-3">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {previewRows.map((row) => {
                    const checked = isRowSelected(row.rowIndex, row.selected);
                    return (
                      <tr key={row.rowIndex} className={!row.valid ? 'bg-red-500/5' : ''}>
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            disabled={!row.valid}
                            checked={checked}
                            onChange={(e) =>
                              setSelectedRows((prev) => ({ ...prev, [row.rowIndex]: e.target.checked }))
                            }
                          />
                        </td>
                        <td className="py-2 px-3 font-mono-num text-white/75">{row.date || '—'}</td>
                        <td className="py-2 px-3 text-white">{row.description}</td>
                        <td className="py-2 px-3 capitalize text-white/70">{row.type}</td>
                        <td className="py-2 px-3 text-right font-mono-num text-white">
                          {row.valid ? <CurrencyText minor={row.amountMinor} currency={row.currency} /> : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {!row.valid ? (
                            <span className="text-red-400">{row.errors.join('; ')}</span>
                          ) : row.isDuplicate ? (
                            <span className="text-amber-300 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Potential duplicate
                            </span>
                          ) : (
                            <span className="text-emerald-400 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-white/60">
                {rowsToImport.length} of {previewRows.length} rows selected for import
              </span>
              <button
                type="button"
                disabled={rowsToImport.length === 0}
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 disabled:opacity-40"
              >
                Confirm &amp; Import {rowsToImport.length} Transactions
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Export & Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GlassCard className="space-y-4">
          <h2 className="text-base font-semibold text-white">Export Account History &amp; Ledger</h2>
          <p className="text-xs text-white/55">
            Download transactions for a specific account or your entire ledger in portable CSV format.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Select account to export"
              value={exportAccountId}
              onChange={(e) => setExportAccountId(e.target.value)}
              className="finora-input px-3 py-2 text-xs flex-1"
            >
              <option value="all">All Accounts ({state.transactions.length} transactions)</option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </GlassCard>

        <GlassCard className="space-y-4">
          <h2 className="text-base font-semibold text-white">Complete Backup &amp; Restoration</h2>
          <p className="text-xs text-white/55">
            Export a full JSON snapshot of accounts, transactions, budgets, goals, bills, subscriptions, FX rates, and settings.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportFullBackup}
              className="glass-interactive px-4 py-2 rounded-xl text-xs font-medium text-white inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Full Backup (.json)
            </button>
            <label className="glass-interactive px-4 py-2 rounded-xl text-xs font-medium text-white/85 cursor-pointer inline-flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              Restore Backup
              <input type="file" accept=".json,application/json" onChange={handleRestoreBackup} className="sr-only" />
            </label>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export const ActivityHistoryView: React.FC = () => {
  const { state } = useLedger();
  const [filterType, setFilterType] = useState<string>('all');

  if (!state) return null;

  const entries = state.activityLog.filter(
    (e) => filterType === 'all' || e.entityType === filterType
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Activity History"
        subtitle="Chronological audit trail of recorded transactions, balance adjustments, imports, and configuration changes."
        action={
          <select
            aria-label="Filter activity log"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="finora-input px-3 py-2 text-xs"
          >
            <option value="all">All Activity</option>
            <option value="transaction">Transactions</option>
            <option value="account">Accounts &amp; Adjustments</option>
            <option value="budget">Budgets</option>
            <option value="goal">Savings Goals</option>
            <option value="bill">Bills</option>
            <option value="subscription">Subscriptions</option>
            <option value="import">Imports</option>
            <option value="settings">Settings</option>
          </select>
        }
      />

      <GlassCard variant="table" className="p-0 overflow-hidden">
        {entries.length === 0 ? (
          <p className="p-6 text-xs text-white/50">No activity records match this filter.</p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {entries.map((item) => (
              <div key={item.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="text-white font-medium">{item.action}</div>
                  <div className="text-white/50 mt-0.5">{item.summary}</div>
                </div>
                <div className="text-white/45 font-mono-num shrink-0">
                  {new Date(item.timestamp).toLocaleString(state.preferences.locale)}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const {
    state,
    auth,
    updatePreferences,
    upsertFxRates,
    configurePasscode,
    lockWorkspace,
    clearSampleDataAndStartFresh,
    loadSampleData,
    deleteAllWorkspaceData,
    getAuthHeaders,
    notify,
  } = useLedger();

  const [settingsTab, setSettingsTab] = useState<'general' | 'backup' | 'security'>('general');
  const [fetchingFx, setFetchingFx] = useState(false);
  const [manualBase, setManualBase] = useState<CurrencyCode>('EUR');
  const [manualQuote, setManualQuote] = useState<CurrencyCode>('USD');
  const [manualRate, setManualRate] = useState('');

  // Security passcode form
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (!state) return null;

  const prefs = state.preferences;

  const handleFetchLiveFx = async () => {
    setFetchingFx(true);
    try {
      const res = await fetch(`/api/fx/rates?base=${prefs.primaryCurrency}`, {
        headers: getAuthHeaders(),
      });
      const data = (await res.json()) as {
        available: boolean;
        rates?: ExchangeRateEntry[];
        error?: string;
      };
      if (!data.available || !data.rates) {
        notify(data.error || 'Live exchange rates unavailable.', 'warning');
      } else {
        upsertFxRates(data.rates);
      }
    } catch {
      notify('Unable to reach FX rate endpoint.', 'error');
    } finally {
      setFetchingFx(false);
    }
  };

  const handleSaveManualFx = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(manualRate);
    if (manualBase === manualQuote || Number.isNaN(num) || num <= 0) {
      notify('Enter a valid positive rate between two different currencies.', 'warning');
      return;
    }
    upsertFxRates([
      {
        base: manualBase,
        quote: manualQuote,
        rate: num,
        updatedAt: new Date().toISOString(),
        source: 'Manual User Entry',
      },
    ]);
    setManualRate('');
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    const res = await configurePasscode(currentPasscode, newPasscode);
    if (!res.ok) {
      setPassMsg(res.error || 'Failed to update passcode.');
    } else {
      setCurrentPasscode('');
      setNewPasscode('');
      setPassMsg(newPasscode ? 'Passcode saved.' : 'Passcode lock disabled.');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Settings &amp; Backup"
        subtitle="Set your primary currency, import bank CSVs or download backups, and manage workspace privacy."
      />

      <SegmentedControl<'general' | 'backup' | 'security'>
        ariaLabel="Settings sections"
        value={settingsTab}
        onChange={setSettingsTab}
        options={[
          { value: 'general', label: 'Currency & Display' },
          { value: 'backup', label: 'Import & Backup' },
          { value: 'security', label: 'Privacy & Data' },
        ]}
      />

      {settingsTab === 'backup' && <ImportExportView embedded />}

      {settingsTab === 'general' && (
        <>
          {/* Locale & Currency Preferences */}
          <GlassCard className="space-y-4">
            <h2 className="text-base font-semibold text-white">Display, Locale &amp; Primary Currency</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          <div>
            <label htmlFor="pref-curr" className="block text-white/60 mb-1">Primary Reporting Currency</label>
            <select
              id="pref-curr"
              value={prefs.primaryCurrency}
              onChange={(e) => updatePreferences({ primaryCurrency: e.target.value as CurrencyCode })}
              className="w-full finora-input px-3 py-2 text-xs"
            >
              {CURRENCY_LIST.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pref-locale" className="block text-white/60 mb-1">Number Locale</label>
            <select
              id="pref-locale"
              value={prefs.locale}
              onChange={(e) => updatePreferences({ locale: e.target.value })}
              className="w-full finora-input px-3 py-2 text-xs"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="de-DE">Deutsch (EU)</option>
              <option value="fr-FR">Français</option>
              <option value="ja-JP">日本語</option>
            </select>
          </div>
          <div>
            <label htmlFor="pref-datefmt" className="block text-white/60 mb-1">Date Format</label>
            <select
              id="pref-datefmt"
              value={prefs.dateFormat}
              onChange={(e) => updatePreferences({ dateFormat: e.target.value as UserPreferences['dateFormat'] })}
              className="w-full finora-input px-3 py-2 text-xs"
            >
              <option value="MMM D, YYYY">Nov 25, 2026</option>
              <option value="YYYY-MM-DD">2026-11-25</option>
              <option value="MM/DD/YYYY">11/25/2026</option>
              <option value="DD/MM/YYYY">25/11/2026</option>
            </select>
          </div>
          <div>
            <label htmlFor="pref-range" className="block text-white/60 mb-1">Default Dashboard Range</label>
            <select
              id="pref-range"
              value={prefs.defaultDatePreset}
              onChange={(e) => updatePreferences({ defaultDatePreset: e.target.value as DateRangePreset })}
              className="w-full finora-input px-3 py-2 text-xs"
            >
              <option value="today">Today</option>
              <option value="this-week">This week</option>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="this-year">This year</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Multi-Currency FX Rates */}
      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Exchange Rates &amp; Multi-Currency</h2>
            <p className="text-xs text-white/55 mt-0.5">
              Original transaction currencies are always preserved. Conversions use only explicitly saved rates with visible sources and timestamps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleFetchLiveFx()}
            disabled={fetchingFx}
            className="px-3.5 py-2 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingFx ? 'animate-spin' : ''}`} />
            {fetchingFx ? 'Fetching...' : `Fetch Live ECB Rates (${prefs.primaryCurrency})`}
          </button>
        </div>

        <form onSubmit={handleSaveManualFx} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs pt-2 border-t border-white/[0.08]">
          <select value={manualBase} onChange={(e) => setManualBase(e.target.value as CurrencyCode)} className="finora-input px-3 py-2">
            {CURRENCY_LIST.map((c) => <option key={c.code} value={c.code}>1 {c.code}</option>)}
          </select>
          <select value={manualQuote} onChange={(e) => setManualQuote(e.target.value as CurrencyCode)} className="finora-input px-3 py-2">
            {CURRENCY_LIST.map((c) => <option key={c.code} value={c.code}>= {c.code}</option>)}
          </select>
          <input
            type="number"
            step="any"
            min="0.0001"
            placeholder="Exchange rate"
            value={manualRate}
            onChange={(e) => setManualRate(e.target.value)}
            className="finora-input px-3 py-2 font-mono-num"
          />
          <button type="submit" className="glass-interactive px-3 py-2 rounded-xl font-medium text-white">
            Save Manual Rate
          </button>
        </form>

        {state.fxRates.length > 0 && (
          <div className="divide-y divide-white/[0.06] text-xs">
            {state.fxRates.map((r) => (
              <div key={`${r.base}-${r.quote}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono-num text-white">
                  1 {r.base} = {r.rate.toFixed(4)} {r.quote}
                </span>
                <span className="text-white/50">
                  {r.source} · {new Date(r.updatedAt).toLocaleString(prefs.locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
        </>
      )}

      {settingsTab === 'security' && (
        <>
      {/* Privacy & Workspace Passcode Lock */}
      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-white/80" />
            <div>
              <h2 className="text-base font-semibold text-white">Workspace Passcode &amp; Privacy</h2>
              <p className="text-xs text-white/55">
                {auth.hasPasscode
                  ? 'Passcode lock is active. Session tokens stay strictly in memory.'
                  : 'Optional passcode lock is currently off. Set a passcode to require unlock before accessing financial records.'}
              </p>
            </div>
          </div>
          {auth.hasPasscode && (
            <button
              type="button"
              onClick={() => void lockWorkspace()}
              className="glass-interactive px-3.5 py-2 rounded-xl text-xs font-medium text-white inline-flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock Now
            </button>
          )}
        </div>

        <form onSubmit={handlePasscodeSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {auth.hasPasscode && (
            <input
              type="password"
              placeholder="Current passcode"
              value={currentPasscode}
              onChange={(e) => setCurrentPasscode(e.target.value)}
              className="finora-input px-3 py-2"
            />
          )}
          <input
            type="password"
            placeholder={auth.hasPasscode ? 'New passcode (leave blank to remove)' : 'Set passcode (min 4 chars)'}
            value={newPasscode}
            onChange={(e) => setNewPasscode(e.target.value)}
            className="finora-input px-3 py-2"
          />
          <button
            type="submit"
            className="glass-interactive px-4 py-2 rounded-xl font-medium text-white inline-flex items-center justify-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {auth.hasPasscode ? 'Update / Remove Passcode' : 'Enable Passcode Lock'}
          </button>
        </form>
        {passMsg && <p className="text-xs text-white/75">{passMsg}</p>}
      </GlassCard>

      {/* Data Retention & Sample Data Controls */}
      <GlassCard className="space-y-4">
        <h2 className="text-base font-semibold text-white">Data Retention &amp; Workspace Reset</h2>
        <p className="text-xs text-white/55">
          Switch between a clean empty ledger, the reconciled 3-month sample dataset, or permanently erase all stored records.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {state.isSampleData ? (
            <button
              type="button"
              onClick={clearSampleDataAndStartFresh}
              className="glass-interactive px-4 py-2 rounded-xl text-xs font-medium text-white"
            >
              Clear Sample Data &amp; Start Fresh
            </button>
          ) : (
            <button
              type="button"
              onClick={loadSampleData}
              className="glass-interactive px-4 py-2 rounded-xl text-xs font-medium text-white"
            >
              Load 3-Month Sample Dataset
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-400/35 text-xs font-medium text-red-300 hover:bg-red-500/30 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete All Workspace Data
          </button>
        </div>
      </GlassCard>
        </>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void deleteAllWorkspaceData()}
        title="Delete All Workspace Data"
        message={`This permanently removes all ${state.transactions.length} transactions, accounts, budgets, savings goals, bills, and subscriptions from the local store. Export a backup first if needed.`}
        confirmLabel="Permanently Delete Everything"
      />
    </div>
  );
};

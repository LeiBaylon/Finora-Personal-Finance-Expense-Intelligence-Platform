import React, { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Lock, Plus, RefreshCw, Wallet } from 'lucide-react';
import { LedgerProvider, useLedger } from './context/LedgerContext';
import { MobileMenuTrigger, NAV_SECTIONS, Sidebar } from './components/Sidebar';
import { TransactionModal } from './components/modals/TransactionModal';
import { ToastStack } from './components/ui/GlassPrimitives';
import { AccountsAndCategoriesView } from './components/views/AccountsCategoriesView';
import { BudgetsView } from './components/views/BudgetsView';
import { DashboardView } from './components/views/DashboardView';
import { InsightsView } from './components/views/IntelligenceViews';
import { BillsAndSubscriptionsView } from './components/views/PaymentsViews';
import { SavingsGoalsView } from './components/views/SavingsPlanningView';
import { SettingsView } from './components/views/SystemViews';
import { TransactionsView } from './components/views/TransactionsView';

const WorkspaceShell: React.FC = () => {
  const {
    state,
    loading,
    saving,
    error,
    auth,
    activeWorkspace,
    setActiveWorkspace,
    unlockWorkspace,
  } = useLedger();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickTxOpen, setQuickTxOpen] = useState(false);
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('all');

  const [passcodeInput, setPasscodeInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);
    const ok = await unlockWorkspace(passcodeInput);
    setUnlocking(false);
    if (!ok) {
      setUnlockError('Incorrect passcode. Please try again.');
    } else {
      setPasscodeInput('');
    }
  };

  if (auth.checked && auth.hasPasscode && !auth.authenticated) {
    return (
      <div className="min-h-screen finora-ambient-canvas flex items-center justify-center p-4">
        <div className="glass-modal rounded-[24px] p-8 max-w-sm w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Finora Locked</h1>
              <p className="text-xs text-white/55">Enter your workspace passcode to continue</p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-3.5">
            <div>
              <label htmlFor="unlock-pass" className="block text-xs text-white/65 mb-1">
                Passcode
              </label>
              <input
                id="unlock-pass"
                type="password"
                autoFocus
                required
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                className="w-full finora-input px-3.5 py-2.5 text-sm"
              />
            </div>
            {unlockError && (
              <p role="alert" className="text-xs text-red-400">
                {unlockError}
              </p>
            )}
            <button
              type="submit"
              disabled={unlocking}
              className="w-full py-2.5 rounded-xl bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors"
            >
              {unlocking ? 'Verifying...' : 'Unlock Workspace'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading && !state) {
    return (
      <div className="min-h-screen finora-ambient-canvas flex items-center justify-center p-6">
        <div className="glass-secondary rounded-[22px] p-8 max-w-md w-full space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Loading Finora Ledger</div>
              <div className="text-xs text-white/50">Reconciling accounts and analytics...</div>
            </div>
          </div>
          <div className="space-y-2.5 pt-2">
            <div className="h-3 rounded-full bg-white/[0.08] w-3/4 animate-pulse" />
            <div className="h-3 rounded-full bg-white/[0.06] w-1/2 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="min-h-screen finora-ambient-canvas flex items-center justify-center p-6">
        <div className="glass-secondary rounded-[22px] p-8 max-w-md w-full space-y-4">
          <h1 className="text-base font-semibold text-white">Unable to Open Workspace</h1>
          <p className="text-xs text-white/65 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-medium inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentSection = NAV_SECTIONS.find((sec) =>
    sec.items.some((item) => item.id === activeWorkspace)
  );
  const currentItem = currentSection?.items.find((item) => item.id === activeWorkspace);

  const renderWorkspace = () => {
    switch (activeWorkspace) {
      case 'dashboard':
        return (
          <DashboardView
            onInspectCategory={(catId) => {
              setTxCategoryFilter(catId);
              setActiveWorkspace('transactions');
            }}
          />
        );
      case 'transactions':
        return <TransactionsView initialCategoryFilter={txCategoryFilter} />;
      case 'accounts':
        return <AccountsAndCategoriesView />;
      case 'budgets':
        return <BudgetsView />;
      case 'savings-goals':
        return <SavingsGoalsView />;
      case 'bills':
        return <BillsAndSubscriptionsView />;
      case 'insights':
        return <InsightsView />;
      case 'settings':
        return <SettingsView />;
    }
  };

  return (
    <div className="min-h-screen finora-ambient-canvas text-white flex">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Contextual Workspace Header */}
        <header className="sticky top-0 z-30 px-4 sm:px-7 pt-3 pb-2">
          <div className="glass-primary rounded-2xl px-4 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <MobileMenuTrigger onOpen={() => setMobileMenuOpen(true)} />
              <div className="flex items-center gap-2 text-xs text-white/55 truncate">
                <span className="font-medium text-white/85 whitespace-nowrap">Finora</span>
                <span aria-hidden="true">/</span>
                <span className="hidden sm:inline whitespace-nowrap">{currentSection?.title}</span>
                <span className="hidden sm:inline" aria-hidden="true">/</span>
                <span className="text-white font-medium truncate">{currentItem?.label}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {saving && (
                <span className="text-[11px] text-white/45 hidden sm:inline whitespace-nowrap">
                  Saving...
                </span>
              )}
              <button
                type="button"
                onClick={() => setQuickTxOpen(true)}
                className="glass-interactive px-3.5 py-1.5 rounded-xl text-white/90 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Quick Entry
              </button>
            </div>
          </div>
        </header>

        {/* Sliding Workspace Viewport */}
        <main className="flex-1 px-4 sm:px-7 py-5 max-w-[1400px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeWorkspace}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {renderWorkspace()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <TransactionModal open={quickTxOpen} onClose={() => setQuickTxOpen(false)} />
      <ToastStack />
    </div>
  );
};

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <LedgerProvider>
        <WorkspaceShell />
      </LedgerProvider>
    </MotionConfig>
  );
}

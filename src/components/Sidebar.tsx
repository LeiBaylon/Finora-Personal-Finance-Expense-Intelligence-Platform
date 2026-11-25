import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  ArrowLeftRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Landmark,
  LayoutDashboard,
  Menu,
  PiggyBank,
  Settings,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import type { WorkspaceId } from '../core/types';
import { useLedger } from '../context/LedgerContext';

export interface NavItem {
  id: WorkspaceId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Money',
    items: [
      { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
      { id: 'accounts', label: 'Accounts', icon: Landmark },
    ],
  },
  {
    title: 'Planning & Bills',
    items: [
      { id: 'budgets', label: 'Budgets', icon: Gauge },
      { id: 'savings-goals', label: 'Savings Goals', icon: PiggyBank },
      { id: 'bills', label: 'Bills & Subscriptions', icon: CalendarClock },
    ],
  },
  {
    title: 'Insights & System',
    items: [
      { id: 'insights', label: 'Insights', icon: Sparkles },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = 'finora_sidebar_collapsed';

export const Sidebar: React.FC<{
  mobileOpen: boolean;
  onCloseMobile: () => void;
}> = ({ mobileOpen, onCloseMobile }) => {
  const { activeWorkspace, setActiveWorkspace } = useLedger();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [hoveredTooltip, setHoveredTooltip] = useState<{ label: string; top: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // ignore storage errors
    }
  }, [collapsed]);

  const handleSelect = (id: WorkspaceId) => {
    setActiveWorkspace(id);
    onCloseMobile();
  };

  const renderNavBody = (isCollapsed: boolean) => (
    <div className="flex flex-col h-full">
      {/* Brand Lockup */}
      <div
        className={`flex items-center ${
          isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
        } pt-3 pb-2.5 border-b border-white/[0.08]`}
      >
        <button
          type="button"
          onClick={() => handleSelect('dashboard')}
          className="flex items-center gap-2.5 text-left min-w-0"
          aria-label="Finora Dashboard"
        >
          <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center shrink-0 shadow-sm">
            <Wallet className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              className="text-base font-semibold tracking-tight text-white whitespace-nowrap"
            >
              Finora
            </motion.span>
          )}
        </button>

        {!isCollapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className="hidden lg:flex w-7 h-7 rounded-lg glass-interactive items-center justify-center text-white/60 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {isCollapsed && (
        <div className="hidden lg:flex justify-center py-2 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="w-9 h-8 rounded-lg glass-interactive flex items-center justify-center text-white/60 hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Sections */}
      <nav aria-label="Primary Workspace Navigation" className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2.5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            {!isCollapsed ? (
              <div className="px-2.5 pb-1 text-[10.5px] font-medium text-white/40 whitespace-nowrap truncate">
                {section.title}
              </div>
            ) : (
              <div className="h-px bg-white/[0.07] mx-2 my-1" aria-hidden="true" />
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = activeWorkspace === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      onMouseEnter={(e) => {
                        if (isCollapsed) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredTooltip({
                            label: item.label,
                            top: rect.top + rect.height / 2,
                          });
                        }
                      }}
                      onMouseLeave={() => setHoveredTooltip(null)}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={`relative w-full flex items-center ${
                        isCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-1.5'
                      } rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap`}
                    >
                      {active && (
                        <motion.span
                          layoutId="finora-sidebar-active-pill"
                          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                          className="absolute inset-0 rounded-xl bg-white/[0.12] border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                          aria-hidden="true"
                        />
                      )}
                      <Icon
                        className={`relative z-10 w-4 h-4 shrink-0 ${
                          active ? 'text-white' : 'text-white/55'
                        }`}
                      />
                      {!isCollapsed && (
                        <span
                          className={`relative z-10 truncate ${
                            active ? 'text-white' : 'text-white/70 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Quiet footer */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-white/40">
          <span className="inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Local-first ledger
          </span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Floating Collapsible Sidebar */}
      <aside
        style={{ width: collapsed ? 76 : 256 }}
        className="hidden lg:block shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] h-[calc(100vh-24px)] sticky top-3 ml-3 my-3"
      >
        <div className="glass-primary rounded-[24px] h-full overflow-hidden">
          {renderNavBody(collapsed)}
        </div>

        {/* Floating Glass Tooltip in Collapsed Mode */}
        <AnimatePresence>
          {collapsed && hoveredTooltip && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.14 }}
              style={{ top: hoveredTooltip.top, transform: 'translateY(-50%)' }}
              className="fixed left-[96px] z-50 glass-floating px-3 py-1.5 rounded-xl text-xs font-medium text-white pointer-events-none whitespace-nowrap"
            >
              {hoveredTooltip.label}
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-72 max-w-[85vw] h-full p-3"
            >
              <div className="glass-primary rounded-[24px] h-full overflow-hidden relative">
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close navigation menu"
                  className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg glass-interactive flex items-center justify-center text-white/75 z-20"
                >
                  <X className="w-4 h-4" />
                </button>
                {renderNavBody(false)}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export const MobileMenuTrigger: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label="Open navigation menu"
    className="lg:hidden w-9 h-9 rounded-xl glass-interactive flex items-center justify-center text-white/85 shrink-0"
  >
    <Menu className="w-4 h-4" />
  </button>
);

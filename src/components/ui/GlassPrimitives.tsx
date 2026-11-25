import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { formatMoney } from '../../core/money';
import type { CurrencyCode } from '../../core/types';
import { useLedger } from '../../context/LedgerContext';

export const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'table';
}> = ({ children, className = '', variant = 'secondary' }) => {
  const materialClass =
    variant === 'primary'
      ? 'glass-primary'
      : variant === 'table'
      ? 'glass-table'
      : 'glass-secondary';
  return (
    <section className={`${materialClass} rounded-[20px] p-5 ${className}`}>
      {children}
    </section>
  );
};

export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
    <div className="min-w-0">
      <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-white [text-wrap:balance]">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-white/60 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
      )}
    </div>
    {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
  </div>
);

export const CurrencyText: React.FC<{
  minor: number;
  currency: CurrencyCode;
  locale?: string;
  showPlus?: boolean;
  compact?: boolean;
  className?: string;
}> = ({ minor, currency, locale = 'en-US', showPlus, compact, className = '' }) => (
  <span className={`font-mono-num tabular-nums ${className}`}>
    {formatMoney(minor, currency, locale, { showPlus, compact })}
  </span>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => (
  <div className="glass-secondary rounded-[20px] p-10 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-6">
    {icon && (
      <div className="w-11 h-11 rounded-2xl glass-interactive flex items-center justify-center text-white/75 mb-4">
        {icon}
      </div>
    )}
    <h3 className="text-base font-semibold text-white">{title}</h3>
    <p className="text-sm text-white/55 mt-1.5 max-w-md leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 px-4 py-2 text-sm font-medium rounded-xl bg-white text-black hover:bg-white/90 transition-colors whitespace-nowrap"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (val: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.09]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
              active
                ? 'bg-white text-black shadow-sm'
                : 'text-white/65 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const GlassModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidthClass = 'max-w-xl', children }) => {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`relative z-10 w-full ${maxWidthClass} glass-modal rounded-[22px] p-6 max-h-[90vh] overflow-y-auto`}
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                {subtitle && <p className="text-xs text-white/55 mt-0.5">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                className="w-8 h-8 rounded-lg glass-interactive flex items-center justify-center text-white/70 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = true,
}) => (
  <GlassModal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
    <p className="text-sm text-white/75 leading-relaxed">{message}</p>
    <div className="flex items-center justify-end gap-2.5 mt-6">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-xs font-medium rounded-xl glass-interactive text-white/80 hover:text-white whitespace-nowrap"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          onConfirm();
          onClose();
        }}
        className={`px-4 py-2 text-xs font-medium rounded-xl whitespace-nowrap transition-colors ${
          destructive
            ? 'bg-red-500/90 text-white hover:bg-red-500'
            : 'bg-white text-black hover:bg-white/90'
        }`}
      >
        {confirmLabel}
      </button>
    </div>
  </GlassModal>
);

export const ToastStack: React.FC = () => {
  const { toasts, dismissToast } = useLedger();

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto glass-floating rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {t.tone === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {t.tone === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
              {t.tone === 'error' && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
              {t.tone === 'info' && <Info className="w-4 h-4 text-white/75 shrink-0" />}
              <span className="text-xs text-white/90 leading-snug">{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="text-white/50 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

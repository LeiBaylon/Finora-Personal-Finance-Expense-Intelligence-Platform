import React, { useState } from 'react';
import { motion } from 'motion/react';
import { formatMoney } from '../../core/money';
import type { CategoryBreakdownItem, MonthlyCashFlowPoint } from '../../core/accounting';
import type { CurrencyCode } from '../../core/types';

export const CashFlowBarChart: React.FC<{
  data: MonthlyCashFlowPoint[];
  currency: CurrencyCode;
  locale?: string;
  onSelectMonth?: (monthKey: string) => void;
}> = ({ data, currency, locale = 'en-US', onSelectMonth }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-white/45">
        No cash flow data available for this range.
      </div>
    );
  }

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.incomeMinor, d.expensesMinor])
  );
  const height = 210;
  const chartBottom = 176;
  const barAreaHeight = 148;

  return (
    <div className="relative select-none">
      <div className="flex items-center justify-between gap-4 mb-3 text-xs text-white/60">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/90" />
            Income
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-400/85" />
            Expenses
          </span>
        </div>
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="font-mono-num text-[11px] text-white/85">
            {data[hoveredIdx].label}:{' '}
            <span className="text-emerald-400">
              {formatMoney(data[hoveredIdx].incomeMinor, currency, locale)}
            </span>{' '}
            /{' '}
            <span className="text-red-400">
              {formatMoney(data[hoveredIdx].expensesMinor, currency, locale)}
            </span>{' '}
            (Net {formatMoney(data[hoveredIdx].netCashFlowMinor, currency, locale, { showPlus: true })})
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${Math.max(420, data.length * 74)} ${height}`}
        className="w-full h-52 overflow-visible"
        role="img"
        aria-label="Income versus expenses monthly cash flow chart"
      >
        {[0.25, 0.5, 0.75, 1].map((tick) => {
          const y = chartBottom - barAreaHeight * tick;
          return (
            <line
              key={tick}
              x1={0}
              x2={Math.max(420, data.length * 74)}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3 4"
            />
          );
        })}

        {data.map((pt, idx) => {
          const colWidth = Math.max(420, data.length * 74) / data.length;
          const cx = idx * colWidth + colWidth / 2;
          const incH = Math.max(2, (pt.incomeMinor / maxVal) * barAreaHeight);
          const expH = Math.max(2, (pt.expensesMinor / maxVal) * barAreaHeight);
          const isHovered = hoveredIdx === idx;

          return (
            <g
              key={pt.monthKey}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectMonth?.(pt.monthKey)}
              className="cursor-pointer"
            >
              {isHovered && (
                <rect
                  x={cx - 26}
                  y={14}
                  width={52}
                  height={chartBottom - 10}
                  rx={10}
                  fill="rgba(255,255,255,0.04)"
                />
              )}
              <motion.rect
                initial={{ height: 0, y: chartBottom }}
                animate={{ height: incH, y: chartBottom - incH }}
                transition={{ duration: 0.45, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                x={cx - 16}
                width={13}
                rx={4}
                fill={isHovered ? 'rgba(52,211,153,1)' : 'rgba(52,211,153,0.78)'}
              />
              <motion.rect
                initial={{ height: 0, y: chartBottom }}
                animate={{ height: expH, y: chartBottom - expH }}
                transition={{ duration: 0.45, delay: idx * 0.04 + 0.05, ease: [0.16, 1, 0.3, 1] }}
                x={cx + 3}
                width={13}
                rx={4}
                fill={isHovered ? 'rgba(248,113,113,1)' : 'rgba(248,113,113,0.76)'}
              />
              <text
                x={cx}
                y={chartBottom + 20}
                textAnchor="middle"
                fill={isHovered ? '#ffffff' : 'rgba(255,255,255,0.52)'}
                fontSize={11}
                fontFamily="JetBrains Mono, monospace"
              >
                {pt.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const MONO_SLICES = [
  'rgba(255,255,255,0.92)',
  'rgba(255,255,255,0.72)',
  'rgba(255,255,255,0.54)',
  'rgba(255,255,255,0.38)',
  'rgba(255,255,255,0.25)',
  'rgba(255,255,255,0.16)',
];

export const CategoryDonutChart: React.FC<{
  items: CategoryBreakdownItem[];
  currency: CurrencyCode;
  locale?: string;
  onSelectCategory?: (categoryId: string) => void;
}> = ({ items, currency, locale = 'en-US', onSelectCategory }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const topItems = items.slice(0, 6);
  const totalMinor = topItems.reduce((s, i) => s + i.amountMinor, 0);

  if (topItems.length === 0 || totalMinor === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-xs text-white/45">
        No categorized transactions in this period.
      </div>
    );
  }

  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let cumulativePct = 0;

  const focused = activeId
    ? topItems.find((i) => i.categoryId === activeId) ?? topItems[0]
    : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90" role="img" aria-label="Category spending breakdown">
          <circle
            cx={80}
            cy={80}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={18}
          />
          {topItems.map((item, idx) => {
            const share = item.amountMinor / totalMinor;
            const dash = Math.max(2, share * circumference - 2);
            const offset = -cumulativePct * circumference;
            cumulativePct += share;
            const isActive = activeId === item.categoryId;

            return (
              <circle
                key={item.categoryId}
                cx={80}
                cy={80}
                r={radius}
                fill="none"
                stroke={MONO_SLICES[idx % MONO_SLICES.length]}
                strokeWidth={isActive ? 22 : 18}
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={offset}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setActiveId(item.categoryId)}
                onMouseLeave={() => setActiveId(null)}
                onClick={() => onSelectCategory?.(item.categoryId)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
          <span className="text-[11px] text-white/50 truncate max-w-[100px]">
            {focused ? focused.categoryName : 'Total'}
          </span>
          <span className="text-sm font-semibold font-mono-num text-white mt-0.5">
            {formatMoney(focused ? focused.amountMinor : totalMinor, currency, locale, { compact: true })}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {topItems.map((item, idx) => {
          const isActive = activeId === item.categoryId;
          return (
            <button
              key={item.categoryId}
              type="button"
              onMouseEnter={() => setActiveId(item.categoryId)}
              onMouseLeave={() => setActiveId(null)}
              onClick={() => onSelectCategory?.(item.categoryId)}
              className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl text-left transition-colors ${
                isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: MONO_SLICES[idx % MONO_SLICES.length] }}
                />
                <span className="text-xs text-white/85 truncate">{item.categoryName}</span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 font-mono-num text-xs">
                <span className="text-white/50">{item.percentage}%</span>
                <span className="text-white font-medium">
                  {formatMoney(item.amountMinor, currency, locale)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const SpendingTrendAreaChart: React.FC<{
  points: Array<{ label: string; valueMinor: number }>;
  currency: CurrencyCode;
  locale?: string;
  strokeColor?: string;
}> = ({ points, currency, locale = 'en-US', strokeColor = 'rgba(255,255,255,0.9)' }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (points.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-white/45">
        Not enough points to plot trend.
      </div>
    );
  }

  const w = 480;
  const h = 150;
  const padX = 14;
  const padY = 16;
  const maxVal = Math.max(1, ...points.map((p) => p.valueMinor));

  const coords = points.map((pt, i) => {
    const x =
      points.length === 1
        ? w / 2
        : padX + (i / (points.length - 1)) * (w - padX * 2);
    const y = h - padY - (pt.valueMinor / maxVal) * (h - padY * 2);
    return { x, y, ...pt };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${h - padY} L ${coords[0].x} ${h - padY} Z`;

  return (
    <div className="relative">
      <div className="flex items-center justify-between text-xs text-white/55 mb-2 min-h-[18px]">
        <span>Trend across {points.length} intervals</span>
        {hoverIdx !== null && coords[hoverIdx] && (
          <span className="font-mono-num text-white">
            {coords[hoverIdx].label}: {formatMoney(coords[hoverIdx].valueMinor, currency, locale)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36 overflow-visible" role="img" aria-label="Spending trend chart">
        <defs>
          <linearGradient id="finoraTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#finoraTrendFill)" />
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c, idx) => (
          <g
            key={c.label}
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
            className="cursor-pointer"
          >
            <circle cx={c.x} cy={c.y} r={10} fill="transparent" />
            <circle
              cx={c.x}
              cy={c.y}
              r={hoverIdx === idx ? 4.5 : 2.5}
              fill="#ffffff"
              opacity={hoverIdx === idx ? 1 : 0.65}
            />
          </g>
        ))}
      </svg>
    </div>
  );
};

export const UtilizationBar: React.FC<{
  pct: number;
  tone?: 'neutral' | 'income' | 'warning' | 'danger';
}> = ({ pct, tone = 'neutral' }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const fillClass =
    tone === 'danger'
      ? 'bg-red-400'
      : tone === 'warning'
      ? 'bg-amber-400'
      : tone === 'income'
      ? 'bg-emerald-400'
      : 'bg-white/85';

  return (
    <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`h-full rounded-full ${fillClass}`}
      />
    </div>
  );
};

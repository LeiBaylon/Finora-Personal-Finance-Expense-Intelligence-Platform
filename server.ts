import 'dotenv/config';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

import {
  computeAllAccountBalances,
  computeBudgetStatus,
  computePeriodSummary,
  computeSavingsGoalProgress,
  computeSubscriptionIntelligence,
  resolveDateRange,
} from './src/core/accounting.ts';
import { generateFinancialInsights } from './src/core/intelligence.ts';
import { formatMoney } from './src/core/money.ts';
import { createEmptyLedgerState } from './src/core/seedData.ts';
import type { CurrencyCode, FinoraLedgerState } from './src/core/types.ts';
import {
  checkPasscode,
  createSessionToken,
  getAuthState,
  getLedger,
  revokeSessionToken,
  saveLedger,
  setWorkspacePasscode,
  verifySessionToken,
} from './server/store.ts';

const PORT = 3000;
const ALLOWED_FX_CURRENCIES = new Set<CurrencyCode>([
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD', 'PHP', 'INR',
]);

function extractBearer(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  return authHeader.slice(7).trim();
}

function requireWorkspaceAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const { hasPasscode } = getAuthState();
  if (!hasPasscode) {
    next();
    return;
  }
  const token = extractBearer(req);
  if (!verifySessionToken(token)) {
    res.status(401).json({ error: 'Workspace is locked. Enter your passcode to unlock.' });
    return;
  }
  next();
}

function isValidLedgerPayload(body: unknown): body is FinoraLedgerState {
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.accounts) &&
    Array.isArray(obj.categories) &&
    Array.isArray(obj.transactions) &&
    Array.isArray(obj.budgets) &&
    Array.isArray(obj.savingsGoals) &&
    typeof obj.preferences === 'object' &&
    obj.preferences !== null
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth / Passcode lock routes
  app.get('/api/auth/status', (req, res) => {
    const auth = getAuthState();
    const token = extractBearer(req);
    res.json({
      hasPasscode: auth.hasPasscode,
      updatedAt: auth.updatedAt,
      authenticated: !auth.hasPasscode || verifySessionToken(token),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!checkPasscode(passcode)) {
      res.status(401).json({ error: 'Incorrect passcode.' });
      return;
    }
    const token = createSessionToken();
    res.json({ token, authenticated: true });
  });

  app.post('/api/auth/setup', (req, res) => {
    const auth = getAuthState();
    const currentPasscode =
      typeof req.body?.currentPasscode === 'string' ? req.body.currentPasscode : '';
    const newPasscode =
      typeof req.body?.newPasscode === 'string' ? req.body.newPasscode.trim() : '';

    if (auth.hasPasscode && !checkPasscode(currentPasscode)) {
      const token = extractBearer(req);
      if (!verifySessionToken(token)) {
        res.status(401).json({ error: 'Current passcode verification failed.' });
        return;
      }
    }

    if (newPasscode && newPasscode.length < 4) {
      res.status(400).json({ error: 'Passcode must be at least 4 characters.' });
      return;
    }

    setWorkspacePasscode(newPasscode || null);
    const token = newPasscode ? createSessionToken() : null;
    res.json({ hasPasscode: Boolean(newPasscode), token });
  });

  app.post('/api/auth/logout', (req, res) => {
    revokeSessionToken(extractBearer(req));
    res.json({ ok: true });
  });

  // Ledger workspace routes (protected when passcode lock is enabled)
  app.get('/api/workspace', requireWorkspaceAuth, (_req, res) => {
    const ledger = getLedger();
    res.json(ledger);
  });

  app.put('/api/workspace', requireWorkspaceAuth, (req, res) => {
    if (!isValidLedgerPayload(req.body)) {
      res.status(400).json({ error: 'Invalid ledger payload.' });
      return;
    }
    const saved = saveLedger(req.body);
    res.json(saved);
  });

  app.delete('/api/workspace', requireWorkspaceAuth, (req, res) => {
    const curr =
      typeof req.query.currency === 'string' && ALLOWED_FX_CURRENCIES.has(req.query.currency as CurrencyCode)
        ? (req.query.currency as CurrencyCode)
        : 'USD';
    const empty = createEmptyLedgerState(curr);
    const saved = saveLedger(empty);
    res.json(saved);
  });

  // Live FX rates from public ECB Frankfurter API (fixed allowlisted host, zero fabricated fallback)
  app.get('/api/fx/rates', requireWorkspaceAuth, async (req, res) => {
    const rawBase = typeof req.query.base === 'string' ? req.query.base.toUpperCase() : 'USD';
    const base = ALLOWED_FX_CURRENCIES.has(rawBase as CurrencyCode) ? (rawBase as CurrencyCode) : 'USD';
    const targets = Array.from(ALLOWED_FX_CURRENCIES).filter((c) => c !== base).join(',');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(targets)}`;
      const upstream = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!upstream.ok) {
        res.status(502).json({
          available: false,
          error: `Exchange rate provider returned HTTP ${upstream.status}.`,
        });
        return;
      }

      const data = (await upstream.json()) as {
        base: CurrencyCode;
        date: string;
        rates: Record<string, number>;
      };
      const updatedAt = new Date().toISOString();
      const entries = Object.entries(data.rates || {})
        .filter(([quote, rate]) => ALLOWED_FX_CURRENCIES.has(quote as CurrencyCode) && typeof rate === 'number' && rate > 0)
        .map(([quote, rate]) => ({
          base: data.base,
          quote: quote as CurrencyCode,
          rate,
          updatedAt,
          source: `ECB via Frankfurter (${data.date})`,
        }));

      res.json({
        available: true,
        base: data.base,
        providerDate: data.date,
        updatedAt,
        source: `ECB via Frankfurter (${data.date})`,
        rates: entries,
      });
    } catch {
      res.json({
        available: false,
        error: 'Live exchange rate service is unreachable right now. You can enter manual rates with explicit timestamps in Settings.',
      });
    }
  });

  // Optional Server-Side Gemini Financial Assistant
  app.post('/api/assistant/ask', requireWorkspaceAuth, async (req, res) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question || question.length > 1000) {
      res.status(400).json({ error: 'Please provide a question under 1,000 characters.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'AI assistant is not configured (GEMINI_API_KEY unavailable). All built-in financial analytics remain fully functional.',
      });
      return;
    }

    try {
      const state = getLedger();
      const today = new Date().toISOString().slice(0, 10);
      const currency = state.preferences.primaryCurrency;
      const locale = state.preferences.locale;

      const thisMonthRange = resolveDateRange('this-month', today);
      const lastMonthRange = resolveDateRange('last-month', today);
      const thisYearRange = resolveDateRange('this-year', today);

      const thisMonthSummary = computePeriodSummary(state, thisMonthRange, currency);
      const lastMonthSummary = computePeriodSummary(state, lastMonthRange, currency);
      const thisYearSummary = computePeriodSummary(state, thisYearRange, currency);
      const balances = computeAllAccountBalances(state.accounts, state.transactions, state.fxRates);
      const subIntel = computeSubscriptionIntelligence(state.subscriptions, currency, state.fxRates, today);
      const insights = generateFinancialInsights(state, today);

      const contextPayload = {
        referenceDate: today,
        isSampleData: state.isSampleData,
        primaryCurrency: currency,
        accounts: state.accounts
          .filter((a) => !a.archived)
          .map((a) => ({
            name: a.name,
            type: a.type,
            currency: a.currency,
            balanceFormatted: formatMoney(balances[a.id] ?? 0, a.currency, locale),
          })),
        summaries: {
          thisMonth: {
            range: thisMonthRange,
            income: formatMoney(thisMonthSummary.totalIncomeMinor, currency, locale),
            netExpenses: formatMoney(thisMonthSummary.netExpensesMinor, currency, locale),
            netCashFlow: formatMoney(thisMonthSummary.netCashFlowMinor, currency, locale),
            savingsRatePct: thisMonthSummary.savingsRatePct,
          },
          lastMonth: {
            range: lastMonthRange,
            income: formatMoney(lastMonthSummary.totalIncomeMinor, currency, locale),
            netExpenses: formatMoney(lastMonthSummary.netExpensesMinor, currency, locale),
            netCashFlow: formatMoney(lastMonthSummary.netCashFlowMinor, currency, locale),
            savingsRatePct: lastMonthSummary.savingsRatePct,
          },
          thisYear: {
            range: thisYearRange,
            income: formatMoney(thisYearSummary.totalIncomeMinor, currency, locale),
            netExpenses: formatMoney(thisYearSummary.netExpensesMinor, currency, locale),
            netCashFlow: formatMoney(thisYearSummary.netCashFlowMinor, currency, locale),
          },
        },
        budgets: state.budgets.map((b) => {
          const st = computeBudgetStatus(b, state.transactions, state.fxRates, today);
          return {
            name: b.name,
            period: `${b.startDate} to ${b.endDate}`,
            limit: formatMoney(st.effectiveLimitMinor, b.currency, locale),
            spent: formatMoney(st.spentMinor, b.currency, locale),
            utilizationPct: st.utilizationPct,
            state: st.state,
          };
        }),
        savingsGoals: state.savingsGoals.map((g) => {
          const p = computeSavingsGoalProgress(g, state.goalTransactions, state.fxRates, today);
          return {
            name: g.name,
            target: formatMoney(g.targetAmountMinor, g.currency, locale),
            saved: formatMoney(p.savedMinor, g.currency, locale),
            remaining: formatMoney(p.remainingMinor, g.currency, locale),
            plannedMonthly: formatMoney(g.plannedContributionMinor, g.currency, locale),
            requiredMonthly: formatMoney(p.requiredMonthlyMinor, g.currency, locale),
            targetDate: g.targetDate,
          };
        }),
        subscriptions: {
          activeCount: subIntel.activeCount,
          monthlyTotal: formatMoney(subIntel.monthlyTotalMinor, currency, locale),
          annualTotal: formatMoney(subIntel.annualTotalMinor, currency, locale),
          items: state.subscriptions.map((s) => ({
            name: s.name,
            amount: formatMoney(s.amountMinor, s.currency, locale),
            frequency: s.frequency,
            status: s.status,
            markedUnusedByUser: s.markedUnusedByUser,
          })),
        },
        bills: state.bills.map((b) => ({
          name: b.name,
          amount: formatMoney(b.amountMinor, b.currency, locale),
          dueDate: b.dueDate,
          status: b.status,
          isEstimated: b.isEstimated,
        })),
        recentCompletedTransactions: state.transactions
          .filter((t) => t.status === 'completed')
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 80)
          .map((t) => ({
            date: t.date,
            type: t.type,
            description: t.description,
            merchant: t.merchant,
            category: state.categories.find((c) => c.id === t.categoryId)?.name ?? 'Uncategorized',
            amount: formatMoney(t.amountMinor, t.currency, locale),
          })),
        computedInsights: insights.map((i) => `${i.title}: ${i.explanation}`),
      };

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `User question: ${question}\n\nAuthorized Ledger Data (JSON):\n${JSON.stringify(contextPayload)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: [
            'You are the Finora Financial Intelligence Assistant.',
            'Strict Rules:',
            '1. Answer ONLY using the provided Authorized Ledger Data JSON. Never invent, extrapolate, or fabricate transactions, balances, dates, or categories.',
            '2. Always explain your calculations clearly with exact figures and categories from the data.',
            '3. If the user asks about something not present in the provided records (for example older months or unrecorded bills), state explicitly what information is missing.',
            '4. Never execute or claim to execute financial transactions.',
            '5. Keep responses concise, structured in plain prose or short bullets, and note briefly when giving planning commentary that your output is informational analysis of recorded data rather than licensed financial advice.',
          ].join('\n'),
        },
      });

      res.json({
        answer: response.text ?? 'No response generated.',
        model: 'gemini-4-hydrogen',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assistant request failed.';
      res.status(502).json({ error: message });
    }
  });

  // Vite dev middleware vs production static assets
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await import('vite');
    const viteServer = await vite.createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Finora server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Finora server:', err);
  process.exit(1);
});

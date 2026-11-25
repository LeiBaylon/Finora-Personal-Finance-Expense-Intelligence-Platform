import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createSampleLedgerState } from '../src/core/seedData.ts';
import type { FinoraLedgerState } from '../src/core/types.ts';

interface StoredAuth {
  passcodeHash: string | null; // "scrypt$saltHex$hashHex"
  updatedAt: string | null;
}

interface PersistedEnvelope {
  auth: StoredAuth;
  ledger: FinoraLedgerState;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.resolve(DATA_DIR, 'finora-store.json');

// Session signing key from env or ephemeral in-memory randomBytes(32)
const SESSION_SECRET = process.env.FINORA_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const REVOKED_TOKENS = new Set<string>();

function ensureStoreDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function readEnvelope(): PersistedEnvelope {
  ensureStoreDir();
  if (!fs.existsSync(STORE_PATH)) {
    const today = new Date().toISOString().slice(0, 10);
    const initial: PersistedEnvelope = {
      auth: { passcodeHash: null, updatedAt: null },
      ledger: createSampleLedgerState(today),
    };
    writeEnvelope(initial);
    return initial;
  }
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as PersistedEnvelope;
  return parsed;
}

function writeEnvelope(envelope: PersistedEnvelope): void {
  ensureStoreDir();
  const tmpPath = `${STORE_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, STORE_PATH);
}

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPasscodeHash(passcode: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(passcode, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function createSessionToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'finora-workspace',
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 12, // 12h
      jti: crypto.randomBytes(12).toString('hex'),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || REVOKED_TOKENS.has(token)) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function revokeSessionToken(token: string | undefined): void {
  if (token) REVOKED_TOKENS.add(token);
}

export function getAuthState(): { hasPasscode: boolean; updatedAt: string | null } {
  const env = readEnvelope();
  return {
    hasPasscode: Boolean(env.auth.passcodeHash),
    updatedAt: env.auth.updatedAt,
  };
}

export function checkPasscode(passcode: string): boolean {
  const env = readEnvelope();
  if (!env.auth.passcodeHash) return true;
  return verifyPasscodeHash(passcode, env.auth.passcodeHash);
}

export function setWorkspacePasscode(newPasscode: string | null): void {
  const env = readEnvelope();
  env.auth = {
    passcodeHash: newPasscode ? hashPasscode(newPasscode) : null,
    updatedAt: new Date().toISOString(),
  };
  writeEnvelope(env);
}

export function getLedger(): FinoraLedgerState {
  return readEnvelope().ledger;
}

export function saveLedger(ledger: FinoraLedgerState): FinoraLedgerState {
  const env = readEnvelope();
  const updated: FinoraLedgerState = {
    ...ledger,
    lastUpdated: new Date().toISOString(),
  };
  env.ledger = updated;
  writeEnvelope(env);
  return updated;
}

import { readLocalStorage, writeLocalStorage } from '@/lib/browserStorage';

const STORAGE_KEY = 'vaultia-local-activity-log';
const MAX_LOCAL_ACTIVITY = 100;

export interface LocalActivityLogEntry {
  id: string;
  vaultSafe: string;
  vaultLabel?: string;
  status: 'blocked';
  type: 'LYX' | 'TOKEN';
  to: string;
  token?: string;
  amount: string;
  reason: string;
  createdAt: number;
}

function readEntries(): LocalActivityLogEntry[] {
  const raw = readLocalStorage(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is LocalActivityLogEntry => (
      !!entry &&
      typeof entry.id === 'string' &&
      typeof entry.vaultSafe === 'string' &&
      entry.status === 'blocked' &&
      (entry.type === 'LYX' || entry.type === 'TOKEN') &&
      typeof entry.to === 'string' &&
      typeof entry.amount === 'string' &&
      typeof entry.reason === 'string' &&
      typeof entry.createdAt === 'number'
    ));
  } catch {
    return [];
  }
}

export function appendLocalActivityLog(entry: LocalActivityLogEntry): boolean {
  const entries = readEntries();
  const deduped = entries.filter((item) => item.id !== entry.id);
  return writeLocalStorage(
    STORAGE_KEY,
    JSON.stringify([entry, ...deduped].slice(0, MAX_LOCAL_ACTIVITY))
  );
}

export function getLocalActivityLogs(vaultSafes?: string[]): LocalActivityLogEntry[] {
  const entries = readEntries();
  if (!vaultSafes?.length) return entries;

  const allowed = new Set(vaultSafes.map((vaultSafe) => vaultSafe.toLowerCase()));
  return entries.filter((entry) => allowed.has(entry.vaultSafe.toLowerCase()));
}
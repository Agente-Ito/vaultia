import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/lib/browserStorage';

const STORAGE_KEY = 'vaultia-pending-multisig-setups';

export interface PendingMultisigSetup {
  safeAddress: string;
  label?: string;
  signers: string[];
  threshold: number;
  timeLock: number;
  createdAt: number;
}

function readEntries(): PendingMultisigSetup[] {
  const raw = readLocalStorage(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((entry): entry is PendingMultisigSetup => (
      !!entry &&
      typeof entry.safeAddress === 'string' &&
      Array.isArray(entry.signers) &&
      entry.signers.every((signer: unknown): signer is string => typeof signer === 'string') &&
      typeof entry.threshold === 'number' &&
      typeof entry.timeLock === 'number' &&
      typeof entry.createdAt === 'number' &&
      (typeof entry.label === 'undefined' || typeof entry.label === 'string')
    ));
  } catch {
    return [];
  }
}

function writeEntries(entries: PendingMultisigSetup[]) {
  if (entries.length === 0) {
    return removeLocalStorage(STORAGE_KEY);
  }

  return writeLocalStorage(STORAGE_KEY, JSON.stringify(entries));
}

export function savePendingMultisigSetup(entry: PendingMultisigSetup): boolean {
  const entries = readEntries().filter((item) => item.safeAddress.toLowerCase() !== entry.safeAddress.toLowerCase());
  return writeEntries([entry, ...entries]);
}

export function getPendingMultisigSetup(safeAddress: string): PendingMultisigSetup | null {
  return readEntries().find((entry) => entry.safeAddress.toLowerCase() === safeAddress.toLowerCase()) ?? null;
}

export function listPendingMultisigSetups(): PendingMultisigSetup[] {
  return readEntries();
}

export function removePendingMultisigSetup(safeAddress: string): boolean {
  const entries = readEntries().filter((entry) => entry.safeAddress.toLowerCase() !== safeAddress.toLowerCase());
  return writeEntries(entries);
}
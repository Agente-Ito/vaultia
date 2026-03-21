/**
 * Secure local controller key storage.
 *
 * Strategy:
 *  - Keys generated via ethers.Wallet.createRandom()
 *  - Encrypted with AES-GCM using a key derived via PBKDF2 from the user's passphrase
 *  - Stored in IndexedDB (persists across sessions, not accessible cross-origin)
 *  - Passphrase is NEVER stored — only the encrypted blob
 *
 * Security properties:
 *  ✅ Keys never leave the browser unencrypted
 *  ✅ No backend custody
 *  ✅ PBKDF2 with 200k iterations resists brute-force
 *  ✅ Random salt + IV per encryption operation
 */

import { ethers } from 'ethers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ControllerKeyPair {
  address: string;
  privateKey: string;
}

export interface EncryptedKeyBlob {
  /** base64-encoded ciphertext */
  ciphertext: string;
  /** base64-encoded random IV (12 bytes) */
  iv: string;
  /** base64-encoded random salt (32 bytes) */
  salt: string;
  /** PBKDF2 iteration count */
  iterations: number;
  version: 1;
}

// ─── Key generation ───────────────────────────────────────────────────────────

/** Generate a fresh Ethereum keypair for use as a mission controller. */
export function generateControllerKey(): ControllerKeyPair {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 200_000;
const HASH = 'SHA-256';

function base64Encode(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function base64Decode(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────

/** Encrypt a private key string with the user's passphrase. */
export async function encryptKey(
  privateKey: string,
  passphrase: string
): Promise<EncryptedKeyBlob> {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const aesKey = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(privateKey)
  );
  return {
    ciphertext: base64Encode(cipherBuf),
    iv: base64Encode(iv),
    salt: base64Encode(salt),
    iterations: PBKDF2_ITERATIONS,
    version: 1,
  };
}

/**
 * Decrypt an encrypted key blob with the user's passphrase.
 * Throws a generic error if the passphrase is wrong (AES-GCM authentication fails).
 */
export async function decryptKey(
  blob: EncryptedKeyBlob,
  passphrase: string
): Promise<string> {
  const salt = base64Decode(blob.salt);
  const iv = base64Decode(blob.iv);
  const ciphertext = base64Decode(blob.ciphertext);
  const aesKey = await deriveKey(passphrase, salt);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    );
  } catch {
    throw new Error('Incorrect passphrase or corrupted key data.');
  }
  return new TextDecoder().decode(plainBuf);
}

// ─── IndexedDB persistence ────────────────────────────────────────────────────

const DB_NAME = 'vaultia-keys';
const DB_VERSION = 1;
const STORE_NAME = 'controller-keys';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'missionId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist an encrypted key blob for a mission ID. */
export async function storeKey(
  missionId: string,
  blob: EncryptedKeyBlob,
  controllerAddress: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ missionId, blob, controllerAddress });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface StoredKeyEntry {
  missionId: string;
  blob: EncryptedKeyBlob;
  controllerAddress: string;
}

/** Load the stored entry for a mission ID. Returns null if not found. */
export async function loadKey(missionId: string): Promise<StoredKeyEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(missionId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Delete stored key for a mission (e.g. after revoking). */
export async function deleteKey(missionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(missionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** List all stored mission IDs that have a key entry. */
export async function listStoredMissionIds(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Export a mission's encrypted blob as a JSON string for user download.
 * The exported blob retains encryption — the passphrase is still required to use it.
 */
export async function exportKeystore(missionId: string): Promise<string | null> {
  const entry = await loadKey(missionId);
  if (!entry) return null;
  return JSON.stringify({ missionId, controllerAddress: entry.controllerAddress, ...entry.blob }, null, 2);
}

/**
 * Import an encrypted blob from a JSON string and store it under a (possibly new) missionId.
 * The user must verify the passphrase separately before trusting the import.
 */
export async function importKeystore(json: string): Promise<{ missionId: string; controllerAddress: string }> {
  const data = JSON.parse(json);
  const { missionId, controllerAddress, ciphertext, iv, salt, iterations, version } = data;
  if (!missionId || !controllerAddress || !ciphertext || !iv || !salt) {
    throw new Error('Invalid keystore format.');
  }
  if (Number(version) !== 1) {
    throw new Error(`Unsupported keystore version: ${version}. Expected version 1.`);
  }
  const blob: EncryptedKeyBlob = { ciphertext, iv, salt, iterations, version };
  await storeKey(missionId, blob, controllerAddress);
  return { missionId, controllerAddress };
}

import { useEffect, useState, useCallback } from 'react';
import { Contract } from 'ethers';
import { decodeRevertReason } from '@/lib/errorMap';

export interface VaultRecord {
  safe: string;
  keyManager: string;
  policyEngine: string;
  label: string;
}

function normalizeVaultRecord(value: unknown): VaultRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<VaultRecord>;
  if (
    typeof record.safe !== 'string' ||
    typeof record.keyManager !== 'string' ||
    typeof record.policyEngine !== 'string' ||
    typeof record.label !== 'string'
  ) {
    return null;
  }

  return {
    safe: record.safe,
    keyManager: record.keyManager,
    policyEngine: record.policyEngine,
    label: record.label,
  };
}

export function useVaults(registry: Contract | null, account: string | null) {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!registry || !account) {
      setVaults([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadVaults = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await registry.getVaults(account);
        if (!cancelled) {
          const normalizedVaults = (result as unknown[])
            .map(normalizeVaultRecord)
            .filter((vault): vault is VaultRecord => vault !== null);

          if (normalizedVaults.length !== result.length && process.env.NODE_ENV === 'development') {
            console.warn('[useVaults] Ignored malformed vault records from registry response.');
          }

          if (result.length > 0 && normalizedVaults.length === 0) {
            setError('Failed to parse vault data returned by the registry.');
          }

          setVaults(normalizedVaults);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(decodeRevertReason(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadVaults();
    return () => {
      cancelled = true;
    };
  }, [registry, account, refreshTick]);

  return { vaults, loading, error, refresh };
}

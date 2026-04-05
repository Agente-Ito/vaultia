import { useEffect, useState, useCallback } from 'react';
import { Contract, ethers } from 'ethers';
import { decodeRevertReason } from '@/lib/errorMap';

const LEGACY_REGISTRY_READ_ABI = [
  'function getVaults(address owner) external view returns (tuple(address safe,address keyManager,address policyEngine,string label)[])',
];

export interface VaultRecord {
  safe: string;
  keyManager: string;
  policyEngine: string;
  multisigController: string;
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
    typeof record.multisigController !== 'string' ||
    typeof record.label !== 'string'
  ) {
    return null;
  }

  return {
    safe: record.safe,
    keyManager: record.keyManager,
    policyEngine: record.policyEngine,
    multisigController: record.multisigController,
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
        let result: unknown[] = [];

        try {
          result = await registry.getVaults(account) as unknown[];
        } catch {
          const legacyRegistry = new Contract(registry.target, LEGACY_REGISTRY_READ_ABI, registry.runner);
          const legacyResult = await legacyRegistry.getVaults(account) as Array<{ safe: string; keyManager: string; policyEngine: string; label: string }>;
          result = legacyResult.map((vault) => ({
            ...vault,
            multisigController: ethers.ZeroAddress,
          }));
        }

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

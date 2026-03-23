'use client';

import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { getAllMissions, MissionRecord, updateMissionStatus } from '@/lib/missions/missionStore';
import { apPermissionsKey } from '@/lib/missions/permissionCompiler';
import { useWeb3 } from '@/context/Web3Context';
import { decodeRevertReason } from '@/lib/errorMap';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? '';

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseMissionsResult {
  missions: MissionRecord[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * List all missions stored locally for the current account and reconcile their
 * on-chain status by reading AddressPermissions:Permissions:<controller> from
 * the vault's ERC725Y storage.
 *
 * If the permission value is 0x0 the local status is overridden to 'revoked'.
 */
export function useMissions(account: string | null): UseMissionsResult {
  const { signer } = useWeb3();
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!account) {
      setMissions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await getAllMissions();
        if (cancelled) return;

        // Filter to missions owned by this account's vaults.
        // Since we have no on-chain ownership index here, we use all locally stored
        // missions (the store is per-browser, so it's already user-scoped).
        const reconciled = await Promise.all(
          all.map(async (m) => {
            try {
              const provider = signer?.provider ?? new ethers.JsonRpcProvider(RPC_URL);
              const permKey = apPermissionsKey(m.controllerAddress);
              // ERC725Y.getData(key) — minimal ABI
              const erc725 = new ethers.Contract(
                m.vaultSafe,
                ['function getData(bytes32 dataKey) view returns (bytes memory)'],
                provider
              );
              const result: string = await erc725.getData(permKey);
              // If permissions == 0x or all zeros → revoked on-chain
              const isRevoked =
                !result ||
                result === '0x' ||
                BigInt(result) === BigInt(0);
              if (isRevoked && m.status !== 'revoked') {
                await updateMissionStatus(m.id, 'revoked');
                return { ...m, status: 'revoked' as const };
              }
              return m;
            } catch {
              // On-chain read failed → keep local status
              return m;
            }
          })
        );

        if (!cancelled) setMissions(reconciled);
      } catch (err: unknown) {
        if (!cancelled) setError(decodeRevertReason(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [account, signer, tick]);

  return { missions, loading, error, reload };
}

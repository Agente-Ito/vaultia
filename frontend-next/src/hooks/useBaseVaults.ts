'use client';

import { useState, useEffect, useCallback } from 'react';
import { decodeRevertReason } from '@/lib/errorMap';
import {
  getBaseReadProvider,
  getBaseVaultFactoryContract,
  isBaseFactoryConfigured,
  BaseVaultRecord,
  buildBaseTokenMeta,
  BASE_CHAIN_ID,
} from '@/lib/web3/baseContracts';
import { ethers } from 'ethers';

export interface BaseVaultSummary extends BaseVaultRecord {
  tokenSymbol: string;
  tokenEmoji: string;
}

export function useBaseVaults(account: string | null) {
  const [vaults, setVaults] = useState<BaseVaultSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!account || !isBaseFactoryConfigured()) {
      setVaults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const provider = getBaseReadProvider();
      const factory = getBaseVaultFactoryContract(provider);
      const raw = await factory.getVaults(account);
      const meta = buildBaseTokenMeta(BASE_CHAIN_ID);

      setVaults(
        raw.map((v) => {
          const tokenKey = (v.token ?? ethers.ZeroAddress).toLowerCase();
          const tokenInfo = meta[tokenKey] ?? { symbol: 'TOKEN', emoji: '🪙' };
          return {
            vault: v.vault,
            policyEngine: v.policyEngine,
            label: v.label,
            token: v.token,
            tokenSymbol: tokenInfo.symbol,
            tokenEmoji: tokenInfo.emoji,
          };
        })
      );
    } catch (e: unknown) {
      setError(decodeRevertReason(e));
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => { fetch(); }, [fetch]);

  return { vaults, loading, error, refresh: fetch };
}

import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '@/context/Web3Context';
import { decodeRevertReason } from '@/lib/errorMap';
import { getProvider } from '@/lib/web3/provider';
import { getSharedBudgetPoolContract, getVaultDirectoryContract } from '@/lib/web3/contracts';
import type { BudgetNode } from '@/components/dashboard/BudgetTreeView';

const VAULT_DIRECTORY_ADDRESS   = process.env.NEXT_PUBLIC_VAULT_DIRECTORY_ADDRESS   ?? '';
const SHARED_BUDGET_POOL_ADDRESS = process.env.NEXT_PUBLIC_SHARED_BUDGET_POOL_ADDRESS ?? '';

const PERIOD_LABELS: Record<number, 'daily' | 'weekly' | 'monthly'> = {
  0: 'daily',
  1: 'weekly',
  2: 'monthly',
};

export interface SubVaultInfo {
  vault: string;
  label: string;
  poolId: string;        // bytes32 hex
  budget: bigint;
  spent: bigint;
  period: 'daily' | 'weekly' | 'monthly';
  parentPoolId: string;
  childPoolIds: string[];
}

export function useSubVaults(parentVaultAddress?: string) {
  const { signer } = useWeb3();
  const [subVaults, setSubVaults]   = useState<SubVaultInfo[]>([]);
  const [budgetNodes, setBudgetNodes] = useState<BudgetNode[]>([]);
  const [loading, setLoading]        = useState(false);
  const [error, setError]            = useState<string | null>(null);

  useEffect(() => {
    if (!VAULT_DIRECTORY_ADDRESS || !SHARED_BUDGET_POOL_ADDRESS) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const provider = signer?.provider ?? getProvider();
        const directory = getVaultDirectoryContract(VAULT_DIRECTORY_ADDRESS, provider);
        const pool      = getSharedBudgetPoolContract(SHARED_BUDGET_POOL_ADDRESS, provider);

        const allVaults: string[] = await directory.getAllVaults();

        const infos: SubVaultInfo[] = [];
        for (const vaultAddr of allVaults) {
          if (parentVaultAddress && vaultAddr.toLowerCase() === parentVaultAddress.toLowerCase()) continue;
          try {
            const [, label, linkedPool] = await directory.getVault(vaultAddr);
            if (!linkedPool || linkedPool === ethers.ZeroHash) continue;
            const [budget, spent, , period, parentPool, , childPools] = await pool.getPool(linkedPool);
            infos.push({
              vault: vaultAddr,
              label: label || vaultAddr,
              poolId: linkedPool,
              budget,
              spent,
              period: PERIOD_LABELS[Number(period)] ?? 'monthly',
              parentPoolId: parentPool,
              childPoolIds: childPools,
            });
          } catch {
            // Skip vaults with no pool or broken data
          }
        }

        if (!cancelled) {
          setSubVaults(infos);
          setBudgetNodes(buildTree(infos));
        }
      } catch (err) {
        if (!cancelled) setError(decodeRevertReason(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [parentVaultAddress, signer]);

  return { subVaults, budgetNodes, loading, error };
}

// ─── Build BudgetTreeView-compatible tree ──────────────────────────────────────

function buildTree(infos: SubVaultInfo[]): BudgetNode[] {
  const byPoolId = new Map<string, SubVaultInfo>();
  for (const info of infos) byPoolId.set(info.poolId, info);

  function infoToNode(info: SubVaultInfo): BudgetNode {
    const children = info.childPoolIds
      .map((childId) => byPoolId.get(childId))
      .filter((c): c is SubVaultInfo => !!c)
      .map(infoToNode);

    return {
      id: info.poolId,
      label: info.label,
      emoji: '🏦',
      spent: parseFloat(ethers.formatEther(info.spent)),
      total: parseFloat(ethers.formatEther(info.budget)),
      period: info.period,
      children: children.length > 0 ? children : undefined,
    };
  }

  // Return only root-level nodes (parentPoolId not present in our set)
  const poolIds = new Set(infos.map((i) => i.poolId));
  return infos
    .filter((info) => !poolIds.has(info.parentPoolId))
    .map(infoToNode);
}

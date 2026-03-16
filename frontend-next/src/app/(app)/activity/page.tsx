'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { useWeb3 } from '@/context/Web3Context';
import { useVaults } from '@/hooks/useVaults';
import { SkeletonRow } from '@/components/common/Skeleton';
import { getSafeContract } from '@/lib/web3/contracts';
import { getProvider } from '@/lib/web3/provider';
import { Alert, AlertDescription } from '@/components/common/Alert';

interface AgentEvent { type: 'LYX' | 'TOKEN'; to: string; token?: string; amount: string; txHash: string; blockNumber: number; }
interface SafePaymentLog {
  args?: {
    to?: string;
    token?: string;
    amount?: bigint;
  };
  transactionHash: string;
  blockNumber: number;
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function ActivityPage() {
  const { registry, account, isConnected, chainId } = useWeb3();
  const { vaults, loading: vaultsLoading } = useVaults(registry, account);
  const [events, setEvents] = useState<(AgentEvent & { vaultLabel: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!vaults.length) {
      setEvents([]);
      setWarning(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setWarning(null);
    const provider = getProvider();

    Promise.all(
      vaults.map(async (vault) => {
        try {
          const safe = getSafeContract(vault.safe, provider);
          const [lyxLogs, tokenLogs] = await Promise.all([
            safe.queryFilter(safe.filters.AgentPaymentExecuted()),
            safe.queryFilter(safe.filters.AgentTokenPaymentExecuted()),
          ]);
          const lyxEvents: (AgentEvent & { vaultLabel: string })[] = lyxLogs.map((raw) => {
            const event = raw as SafePaymentLog;

            return {
            type: 'LYX' as const,
            to: event.args?.to ?? '',
            amount: ethers.formatEther(event.args?.amount ?? BigInt(0)),
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
            vaultLabel: vault.label || short(vault.safe),
          };
          });
          const tokenEvents: (AgentEvent & { vaultLabel: string })[] = tokenLogs.map((raw) => {
            const event = raw as SafePaymentLog;

            return {
            type: 'TOKEN' as const,
            to: event.args?.to ?? '',
            token: event.args?.token ?? '',
            amount: ethers.formatEther(event.args?.amount ?? BigInt(0)),
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
            vaultLabel: vault.label || short(vault.safe),
          };
          });
          return { events: [...lyxEvents, ...tokenEvents], failed: false };
        } catch {
          return { events: [] as (AgentEvent & { vaultLabel: string })[], failed: true };
        }
      })
    )
      .then((perVault) => {
        if (cancelled) {
          return;
        }

        const allEvents = perVault
          .flatMap((r) => r.events)
          .sort((a, b) => b.blockNumber - a.blockNumber)
          .slice(0, 100);
        const anyFailed = perVault.some((r) => r.failed);
        const failedCount = perVault.filter((r) => r.failed).length;
        if (anyFailed && allEvents.length === 0) {
          setError('Failed to load transaction history. Check your RPC connection.');
        } else if (failedCount > 0) {
          setWarning(`Loaded activity from ${vaults.length - failedCount} of ${vaults.length} vaults. Some RPC queries failed.`);
        }
        setEvents(allEvents);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message ?? String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [vaults]);

  const isAnyLoading = vaultsLoading || loading;

  return (
    <div className="space-y-lg">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Activity</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-xs">
          All payments across your vaults
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Agent payments and token transfers</CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected && (
            <Alert variant="info">
              <AlertDescription>Connect your wallet to see activity.</AlertDescription>
            </Alert>
          )}

          {isConnected && isAnyLoading && (
            <div className="space-y-sm">
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </div>
          )}

          {isConnected && error && (
            <p className="text-danger text-sm">Error: {error}</p>
          )}

          {isConnected && !error && warning && (
            <Alert variant="warning" className="mb-md">
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}

          {isConnected && !isAnyLoading && events.length === 0 && (
            <p className="text-neutral-600 dark:text-neutral-400">No transactions yet.</p>
          )}

          {events.length > 0 && (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {events.map((ev, i) => (
                <div key={`${ev.txHash}-${i}`} className="py-sm flex items-start justify-between gap-md">
                  <div className="flex items-start gap-md">
                    <Badge variant={ev.type === 'LYX' ? 'primary' : 'warning'} className="mt-xs shrink-0">
                      {ev.type}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {parseFloat(ev.amount).toFixed(4)} {ev.type === 'LYX' ? 'LYX' : 'tokens'} → {short(ev.to)}
                      </p>
                      <p className="text-xs text-neutral-500 mt-xs">
                        {ev.vaultLabel} · Block {ev.blockNumber}
                      </p>
                      {ev.type === 'TOKEN' && ev.token && (
                        <p className="text-xs font-mono text-neutral-400">{short(ev.token)}</p>
                      )}
                    </div>
                  </div>
                  <a
                    href={`https://explorer.execution.${chainId === 42 ? 'mainnet' : 'testnet'}.lukso.network/tx/${ev.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline shrink-0 mt-xs"
                  >
                    View ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
